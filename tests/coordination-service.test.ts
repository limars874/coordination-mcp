import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CoordinationService } from '../src/application/coordination-service.js';
import { FileArtifactStore } from '../src/persistence/file-artifact-store.js';
import { FileStateStore } from '../src/persistence/file-state-store.js';

describe('CoordinationService tickets', () => {
  let dataDirectory: string;
  let service: CoordinationService;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(join(tmpdir(), 'coordination-mcp-'));
    service = new CoordinationService({
      stateStore: new FileStateStore(dataDirectory),
      artifactStore: new FileArtifactStore(dataDirectory),
    });
  });

  afterEach(async () => {
    await rm(dataDirectory, { recursive: true, force: true });
  });

  it('creates a ticket with server-assigned identity and retrieves it', async () => {
    const ticket = await service.createTicket({
      scope: 'coordination-mcp',
      title: 'Implement the first vertical slice',
      created_by: 'user',
    });

    expect(ticket).toMatchObject({
      scope: 'coordination-mcp',
      title: 'Implement the first vertical slice',
      status: 'open',
      created_by: 'user',
    });
    expect(ticket.id).toMatch(/^T-/);
    expect(Number.isNaN(Date.parse(ticket.created_at))).toBe(false);
    await expect(service.getTicket(ticket.id)).resolves.toEqual(ticket);
  });

  it('shares artifacts through tickets and updates', async () => {
    const artifact = await service.createArtifact({
      scope: 'coordination-mcp',
      media_type: 'text/markdown',
      content: '# Implementation spec',
      created_by: 'chatgpt',
    });
    const ticket = await service.createTicket({
      scope: 'coordination-mcp',
      title: 'Implement the service',
      created_by: 'user',
      artifact_ids: [artifact.id],
    });

    const update = await service.addUpdate({
      scope: 'coordination-mcp',
      ticket_id: ticket.id,
      type: 'result',
      body: 'The service is implemented.',
      created_by: 'local-ai',
      artifact_ids: [artifact.id],
    });

    expect(ticket.artifact_ids).toEqual([artifact.id]);
    expect(update).toMatchObject({
      scope: 'coordination-mcp',
      seq: 1,
      ticket_id: ticket.id,
      artifact_ids: [artifact.id],
    });
    await expect(service.getArtifact(artifact.id)).resolves.toEqual(artifact);
    await expect(service.listUpdates('coordination-mcp', { afterSeq: 0 })).resolves.toEqual({
      updates: [update],
      latestSeq: 1,
      hasMore: false,
    });
  });

  it('paginates tickets and appends artifact associations during mutation', async () => {
    const artifact = await service.createArtifact({
      scope: 'coordination-mcp',
      media_type: 'text/plain',
      content: 'execution report',
      created_by: 'local-ai',
    });
    const first = await service.createTicket({
      scope: 'coordination-mcp',
      title: 'First ticket',
      created_by: 'user',
    });
    const second = await service.createTicket({
      scope: 'coordination-mcp',
      title: 'Second ticket',
      created_by: 'user',
    });

    const page = await service.listTickets('coordination-mcp', { limit: 1 });
    const nextPage = await service.listTickets('coordination-mcp', {
      limit: 1,
      cursor: page.nextCursor,
    });
    const updated = await service.updateTicket(first.id, {
      status: 'done',
      artifact_ids: [artifact.id],
      meta: { reviewed: true },
    });

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeDefined();
    expect(nextPage.items).toHaveLength(1);
    expect(new Set([page.items[0].id, nextPage.items[0].id])).toEqual(
      new Set([first.id, second.id]),
    );
    expect(updated).toMatchObject({
      id: first.id,
      status: 'done',
      artifact_ids: [artifact.id],
      meta: { reviewed: true },
    });
    expect(updated.created_at).toBe(first.created_at);
    expect(updated.created_by).toBe(first.created_by);
  });

  it('rejects an artifact reference from another Scope', async () => {
    const artifact = await service.createArtifact({
      scope: 'other-scope',
      media_type: 'text/plain',
      content: 'private content',
      created_by: 'user',
    });

    await expect(
      service.createTicket({
        scope: 'coordination-mcp',
        title: 'Cross-scope reference',
        created_by: 'user',
        artifact_ids: [artifact.id],
      }),
    ).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' });
  });

  it('recovers Tickets, Updates, and Artifacts after a service restart', async () => {
    const artifact = await service.createArtifact({
      scope: 'coordination-mcp',
      media_type: 'application/json',
      content: '{"ok":true}',
      created_by: 'chatgpt',
    });
    const ticket = await service.createTicket({
      scope: 'coordination-mcp',
      title: 'Durable state',
      created_by: 'user',
      artifact_ids: [artifact.id],
    });
    const update = await service.addUpdate({
      scope: 'coordination-mcp',
      ticket_id: ticket.id,
      type: 'result',
      body: 'State survived the process boundary.',
      created_by: 'local-ai',
    });

    const restartedService = new CoordinationService({
      stateStore: new FileStateStore(dataDirectory),
      artifactStore: new FileArtifactStore(dataDirectory),
    });

    await expect(restartedService.getTicket(ticket.id)).resolves.toEqual(ticket);
    await expect(restartedService.getArtifact(artifact.id)).resolves.toEqual(artifact);
    await expect(restartedService.listUpdates('coordination-mcp', { afterSeq: 0 })).resolves.toEqual({
      updates: [update],
      latestSeq: 1,
      hasMore: false,
    });
  });

  it('rejects binary artifacts, missing Tickets, and immutable Ticket fields', async () => {
    await expect(
      service.createArtifact({
        scope: 'coordination-mcp',
        media_type: 'image/png',
        content: 'not really binary',
        created_by: 'user',
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
    await expect(service.getTicket('T-missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const ticket = await service.createTicket({
      scope: 'coordination-mcp',
      title: 'Immutable fields',
      created_by: 'user',
    });
    const invalidPatch = { title: 'New title', scope: 'other-scope' };
    await expect(service.updateTicket(ticket.id, invalidPatch)).rejects.toMatchObject({
      code: 'IMMUTABLE_FIELD',
    });
  });

  it('allocates Scope-local Update sequences under concurrent writes', async () => {
    const updates = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        service.addUpdate({
          scope: 'coordination-mcp',
          type: 'note',
          body: `Concurrent update ${index}`,
          created_by: 'local-ai',
        }),
      ),
    );
    const sequences = updates.map(update => update.seq).sort((left, right) => left - right);

    expect(sequences).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await expect(service.listUpdates('coordination-mcp', { afterSeq: 0 })).resolves.toMatchObject({
      latestSeq: 10,
      hasMore: false,
    });
  });
});
