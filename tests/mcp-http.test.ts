import { mkdtemp, rm } from 'node:fs/promises';
import { type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CoordinationService } from '../src/application/coordination-service.js';
import { FileArtifactStore } from '../src/persistence/file-artifact-store.js';
import { FileStateStore } from '../src/persistence/file-state-store.js';
import { createCoordinationHttpServer } from '../src/transport/http-server.js';

describe('Coordination MCP HTTP interface', () => {
  let dataDirectory: string;
  let httpServer: Server;
  let baseUrl: string;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(join(tmpdir(), 'coordination-mcp-http-'));
    const service = new CoordinationService({
      stateStore: new FileStateStore(dataDirectory),
      artifactStore: new FileArtifactStore(dataDirectory),
    });
    httpServer = createCoordinationHttpServer(service);
    await new Promise<void>(resolve => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const address = httpServer.address();
    if (address === null || typeof address === 'string') {
      throw new Error('HTTP server did not expose an address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close(error => (error === undefined ? resolve() : reject(error)));
    });
    await rm(dataDirectory, { recursive: true, force: true });
  });

  it('lists tools and executes create_ticket through stateless HTTP', async () => {
    const initialized = await sendMcpRequest({
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'coordination-mcp-test', version: '0.1.0' },
      },
    });
    const tools = await sendMcpRequest({
      id: 2,
      method: 'tools/list',
      params: {},
    });
    const created = await sendMcpRequest({
      id: 3,
      method: 'tools/call',
      params: {
        name: 'create_ticket',
        arguments: {
          scope: 'coordination-mcp',
          title: 'Expose the first MCP tool',
          created_by: 'user',
        },
      },
    });

    expect(initialized.result.serverInfo.name).toBe('coordination-mcp');
    expect(tools.result.tools.map((tool: { name: string }) => tool.name)).toEqual(
      expect.arrayContaining([
        'list_tickets',
        'get_ticket',
        'create_ticket',
        'update_ticket',
        'list_updates',
        'add_update',
        'create_artifact',
        'get_artifact',
      ]),
    );
    expect(created.result.isError).not.toBe(true);
    const payload = JSON.parse(created.result.content[0].text) as {
      ticket: { id: string; status: string };
    };
    expect(payload.ticket.id).toMatch(/^T-/);
    expect(payload.ticket.status).toBe('open');
  });

  it('rejects unknown input fields for every MCP tool', async () => {
    await sendMcpRequest({
      id: 4,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'coordination-mcp-test', version: '0.1.0' },
      },
    });

    const cases = [
      { name: 'list_tickets', arguments: { scope: 'coordination-mcp', unexpected: true } },
      { name: 'get_ticket', arguments: { id: 'T-missing', unexpected: true } },
      {
        name: 'create_ticket',
        arguments: {
          scope: 'coordination-mcp',
          title: 'Strict input',
          created_by: 'user',
          unexpected: true,
        },
      },
      {
        name: 'update_ticket',
        arguments: { id: 'T-missing', title: 'Strict input', unexpected: true },
      },
      { name: 'list_updates', arguments: { scope: 'coordination-mcp', unexpected: true } },
      {
        name: 'add_update',
        arguments: {
          scope: 'coordination-mcp',
          type: 'note',
          body: 'Strict input',
          created_by: 'user',
          unexpected: true,
        },
      },
      {
        name: 'create_artifact',
        arguments: {
          scope: 'coordination-mcp',
          media_type: 'text/plain',
          content: 'Strict input',
          created_by: 'user',
          unexpected: true,
        },
      },
      { name: 'get_artifact', arguments: { id: 'A-missing', unexpected: true } },
    ];

    for (const [index, toolCase] of cases.entries()) {
      const response = await sendMcpRequest({
        id: 5 + index,
        method: 'tools/call',
        params: toolCase,
      });

      expect(response.result.isError).toBe(true);
      expect(response.result.content[0].text).toContain('unexpected');
    }
  });

  it('round-trips the core state model through MCP tools', async () => {
    await sendMcpRequest({
      id: 10,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'coordination-mcp-test', version: '0.1.0' },
      },
    });
    const artifactResponse = await sendMcpRequest({
      id: 11,
      method: 'tools/call',
      params: {
        name: 'create_artifact',
        arguments: {
          scope: 'coordination-mcp',
          media_type: 'text/markdown',
          content: '# Handoff',
          created_by: 'chatgpt',
        },
      },
    });
    const artifact = JSON.parse(artifactResponse.result.content[0].text).artifact as {
      id: string;
    };
    const ticketResponse = await sendMcpRequest({
      id: 12,
      method: 'tools/call',
      params: {
        name: 'create_ticket',
        arguments: {
          scope: 'coordination-mcp',
          title: 'Run the MCP flow',
          created_by: 'user',
          artifact_ids: [artifact.id],
        },
      },
    });
    const ticket = JSON.parse(ticketResponse.result.content[0].text).ticket as { id: string };
    const updatedResponse = await sendMcpRequest({
      id: 13,
      method: 'tools/call',
      params: {
        name: 'update_ticket',
        arguments: {
          id: ticket.id,
          status: 'active',
          meta: { source: 'integration-test' },
        },
      },
    });
    const updateResponse = await sendMcpRequest({
      id: 14,
      method: 'tools/call',
      params: {
        name: 'add_update',
        arguments: {
          scope: 'coordination-mcp',
          ticket_id: ticket.id,
          type: 'result',
          body: 'The MCP flow works.',
          created_by: 'local-ai',
          artifact_ids: [artifact.id],
        },
      },
    });
    const listedUpdates = await sendMcpRequest({
      id: 15,
      method: 'tools/call',
      params: {
        name: 'list_updates',
        arguments: { scope: 'coordination-mcp', after_seq: 0 },
      },
    });
    const readTicket = await sendMcpRequest({
      id: 16,
      method: 'tools/call',
      params: { name: 'get_ticket', arguments: { id: ticket.id } },
    });
    const readArtifact = await sendMcpRequest({
      id: 17,
      method: 'tools/call',
      params: { name: 'get_artifact', arguments: { id: artifact.id } },
    });
    const listedTickets = await sendMcpRequest({
      id: 18,
      method: 'tools/call',
      params: { name: 'list_tickets', arguments: { scope: 'coordination-mcp' } },
    });

    expect(JSON.parse(updatedResponse.result.content[0].text).ticket.status).toBe('active');
    expect(JSON.parse(updateResponse.result.content[0].text).update.seq).toBe(1);
    expect(JSON.parse(listedUpdates.result.content[0].text).updates).toHaveLength(1);
    expect(JSON.parse(readTicket.result.content[0].text).ticket.id).toBe(ticket.id);
    expect(JSON.parse(readArtifact.result.content[0].text).artifact.id).toBe(artifact.id);
    expect(JSON.parse(listedTickets.result.content[0].text).items).toHaveLength(1);
  });

  async function sendMcpRequest(message: Record<string, unknown>) {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': '2025-03-26',
      },
      body: JSON.stringify({ jsonrpc: '2.0', ...message }),
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`MCP request failed (${response.status}): ${responseText}`);
    }
    return parseMcpResponse(responseText) as {
      result: {
        serverInfo: { name: string };
        tools: Array<{ name: string }>;
        content: Array<{ text: string }>;
        isError?: boolean;
      };
    };
  }
});

function parseMcpResponse(responseText: string): unknown {
  const dataLine = responseText
    .split('\n')
    .find(line => line.startsWith('data:'));
  return JSON.parse(dataLine === undefined ? responseText : dataLine.slice('data:'.length).trim());
}
