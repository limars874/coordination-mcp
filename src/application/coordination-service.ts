import { randomUUID } from 'node:crypto';
import { CoordinationError } from '../domain/errors.js';
import type {
  AddUpdateInput,
  Artifact,
  ArtifactStore,
  CreateArtifactInput,
  CreateTicketInput,
  ListTicketsOptions,
  ListTicketsResult,
  ListUpdatesOptions,
  ListUpdatesResult,
  Metadata,
  StateStore,
  Ticket,
  Update,
  UpdateTicketInput,
} from '../domain/model.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export class CoordinationService {
  private readonly scopeLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly dependencies: {
      stateStore: StateStore;
      artifactStore: ArtifactStore;
    },
  ) {}

  async createTicket(input: CreateTicketInput): Promise<Ticket> {
    validateScope(input.scope);
    validateNonEmpty(input.title, 'title');
    validateNonEmpty(input.created_by, 'created_by');
    validateMetadata(input.meta);

    return this.withScopeLock(input.scope, async () => {
      const artifactIds = await this.validateArtifactReferences(input.scope, input.artifact_ids);
      const ticket: Ticket = {
        id: `T-${randomUUID()}`,
        scope: input.scope,
        title: input.title,
        status: input.status ?? 'open',
        created_by: input.created_by,
        created_at: new Date().toISOString(),
        ...(artifactIds.length > 0 ? { artifact_ids: artifactIds } : {}),
        ...(input.meta === undefined ? {} : { meta: { ...input.meta } }),
      };

      await this.dependencies.stateStore.createTicket(ticket);
      return ticket;
    });
  }

  async getTicket(id: string): Promise<Ticket> {
    validateNonEmpty(id, 'id');
    const ticket = await this.dependencies.stateStore.getTicket(id);
    if (ticket === undefined) {
      throw new CoordinationError('NOT_FOUND', `Ticket not found: ${id}`);
    }
    return ticket;
  }

  async listTickets(scope: string, options: ListTicketsOptions = {}): Promise<ListTicketsResult> {
    validateScope(scope);
    validateOptionalNonEmpty(options.status, 'status');
    const limit = validateLimit(options.limit);
    return this.dependencies.stateStore.listTickets(scope, {
      ...options,
      limit,
    });
  }

  async updateTicket(id: string, input: UpdateTicketInput): Promise<Ticket> {
    validateNonEmpty(id, 'id');
    if (Object.keys(input).length === 0) {
      throw new CoordinationError('INVALID_ARGUMENT', 'At least one mutable Ticket field is required');
    }
    rejectImmutableTicketFields(input);
    validateOptionalNonEmpty(input.title, 'title');
    validateOptionalNonEmpty(input.status, 'status');
    validateArtifactIdsInput(input.artifact_ids);
    validateMetadata(input.meta);

    const existing = await this.getTicket(id);
    return this.withScopeLock(existing.scope, async () => {
      const current = await this.getTicket(id);
      const artifactIds =
        input.artifact_ids === undefined
          ? current.artifact_ids
          : await this.validateArtifactReferences(current.scope, [
              ...(current.artifact_ids ?? []),
              ...input.artifact_ids,
            ]);
      const nextTicket: Ticket = {
        ...current,
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(artifactIds === undefined || artifactIds.length === 0
          ? { artifact_ids: undefined }
          : { artifact_ids: artifactIds }),
        ...(input.meta === undefined
          ? {}
          : { meta: { ...(current.meta ?? {}), ...input.meta } }),
      };

      if (nextTicket.artifact_ids === undefined) {
        delete nextTicket.artifact_ids;
      }
      await this.dependencies.stateStore.saveTicket(nextTicket);
      return nextTicket;
    });
  }

  async addUpdate(input: AddUpdateInput): Promise<Update> {
    validateScope(input.scope);
    validateNonEmpty(input.type, 'type');
    validateNonEmpty(input.body, 'body');
    validateNonEmpty(input.created_by, 'created_by');
    validateMetadata(input.meta);

    return this.withScopeLock(input.scope, async () => {
      if (input.ticket_id !== undefined) {
        validateNonEmpty(input.ticket_id, 'ticket_id');
        const ticket = await this.getTicket(input.ticket_id);
        if (ticket.scope !== input.scope) {
          throw new CoordinationError(
            'SCOPE_MISMATCH',
            `Ticket ${input.ticket_id} does not belong to Scope ${input.scope}`,
          );
        }
      }

      const artifactIds = await this.validateArtifactReferences(input.scope, input.artifact_ids);
      const update: Update = {
        id: `U-${randomUUID()}`,
        scope: input.scope,
        seq: (await this.dependencies.stateStore.getLatestUpdateSeq(input.scope)) + 1,
        ...(input.ticket_id === undefined ? {} : { ticket_id: input.ticket_id }),
        type: input.type,
        body: input.body,
        created_by: input.created_by,
        created_at: new Date().toISOString(),
        ...(artifactIds.length > 0 ? { artifact_ids: artifactIds } : {}),
        ...(input.meta === undefined ? {} : { meta: { ...input.meta } }),
      };

      await this.dependencies.stateStore.appendUpdate(update);
      return update;
    });
  }

  async listUpdates(
    scope: string,
    options: ListUpdatesOptions = {},
  ): Promise<ListUpdatesResult> {
    validateScope(scope);
    if (
      options.afterSeq !== undefined &&
      (!Number.isInteger(options.afterSeq) || options.afterSeq < 0)
    ) {
      throw new CoordinationError('INVALID_ARGUMENT', 'afterSeq must be a non-negative integer');
    }
    validateOptionalNonEmpty(options.ticketId, 'ticketId');
    validateOptionalNonEmpty(options.type, 'type');
    const limit = validateLimit(options.limit);
    return this.withScopeLock(scope, () =>
      this.dependencies.stateStore.listUpdates(scope, {
        ...options,
        limit,
      }),
    );
  }

  async createArtifact(input: CreateArtifactInput): Promise<Artifact> {
    validateScope(input.scope);
    validateNonEmpty(input.media_type, 'media_type');
    validateNonEmpty(input.created_by, 'created_by');
    if (typeof input.content !== 'string') {
      throw new CoordinationError('INVALID_ARGUMENT', 'content must be a string');
    }
    validateMetadata(input.meta);
    validateMediaType(input.media_type);

    return this.withScopeLock(input.scope, async () => {
      const artifact: Artifact = {
        id: `A-${randomUUID()}`,
        scope: input.scope,
        media_type: input.media_type,
        content: input.content,
        created_by: input.created_by,
        created_at: new Date().toISOString(),
        ...(input.meta === undefined ? {} : { meta: { ...input.meta } }),
      };
      await this.dependencies.artifactStore.saveArtifact(artifact);
      return artifact;
    });
  }

  async getArtifact(id: string): Promise<Artifact> {
    validateNonEmpty(id, 'id');
    const artifact = await this.dependencies.artifactStore.getArtifact(id);
    if (artifact === undefined) {
      throw new CoordinationError('NOT_FOUND', `Artifact not found: ${id}`);
    }
    return artifact;
  }

  private async validateArtifactReferences(scope: string, ids?: string[]): Promise<string[]> {
    validateArtifactIdsInput(ids);
    if (ids === undefined) {
      return [];
    }

    const uniqueIds = [...new Set(ids)];
    for (const id of uniqueIds) {
      const artifact = await this.dependencies.artifactStore.getArtifact(id);
      if (artifact === undefined) {
        throw new CoordinationError('INVALID_REFERENCE', `Artifact not found: ${id}`);
      }
      if (artifact.scope !== scope) {
        throw new CoordinationError(
          'SCOPE_MISMATCH',
          `Artifact ${id} does not belong to Scope ${scope}`,
        );
      }
    }
    return uniqueIds;
  }

  private async withScopeLock<T>(scope: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.scopeLocks.get(scope) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => {
      release = resolve;
    });
    this.scopeLocks.set(scope, current);

    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.scopeLocks.get(scope) === current) {
        this.scopeLocks.delete(scope);
      }
    }
  }
}

function validateScope(scope: string): void {
  validateNonEmpty(scope, 'scope');
}

function validateNonEmpty(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CoordinationError('INVALID_ARGUMENT', `${field} must be a non-empty string`);
  }
}

function validateOptionalNonEmpty(value: string | undefined, field: string): void {
  if (value !== undefined) {
    validateNonEmpty(value, field);
  }
}

function rejectImmutableTicketFields(input: UpdateTicketInput): void {
  for (const field of ['id', 'scope', 'created_by', 'created_at']) {
    if (field in input) {
      throw new CoordinationError('IMMUTABLE_FIELD', `Ticket field cannot be changed: ${field}`);
    }
  }
}

function validateArtifactIdsInput(ids: string[] | undefined): void {
  if (ids === undefined) {
    return;
  }
  if (!Array.isArray(ids)) {
    throw new CoordinationError('INVALID_ARGUMENT', 'artifact_ids must be an array');
  }
  for (const id of ids) {
    validateNonEmpty(id, 'artifact_id');
  }
}

function validateMetadata(meta: Metadata | undefined): void {
  if (meta === undefined) {
    return;
  }
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
    throw new CoordinationError('INVALID_ARGUMENT', 'meta must be an object');
  }
  try {
    JSON.stringify(meta);
  } catch (error) {
    throw new CoordinationError('INVALID_ARGUMENT', 'meta must contain JSON-serializable values', {
      cause: error,
    });
  }
}

function validateLimit(limit: number | undefined): number {
  const value = limit ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new CoordinationError(
      'INVALID_ARGUMENT',
      `limit must be an integer between 1 and ${MAX_PAGE_SIZE}`,
    );
  }
  return value;
}

function validateMediaType(mediaType: string): void {
  const baseMediaType = mediaType.split(';', 1)[0].trim().toLowerCase();
  if (
    !baseMediaType.startsWith('text/') &&
    baseMediaType !== 'application/json' &&
    !baseMediaType.endsWith('+json')
  ) {
    throw new CoordinationError(
      'UNSUPPORTED_MEDIA_TYPE',
      `Only textual media types are supported: ${mediaType}`,
    );
  }
}
