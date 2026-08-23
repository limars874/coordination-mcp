import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { CoordinationError } from '../domain/errors.js';
import type { CoordinationService } from '../application/coordination-service.js';

const metadataSchema = z.record(z.string(), z.unknown()).optional();
const artifactIdsSchema = z.array(z.string().min(1)).optional();

export function createMcpServer(service: CoordinationService): McpServer {
  const server = new McpServer({ name: 'coordination-mcp', version: '0.1.0' });

  server.registerTool(
    'list_tickets',
    {
      description: 'List current Tickets in a Scope.',
      inputSchema: z
        .object({
          scope: z.string().min(1),
          status: z.string().min(1).optional(),
          limit: z.number().int().min(1).max(100).optional(),
          cursor: z.string().optional(),
        })
        .strict(),
    },
    async input =>
      runTool(async () => {
        const result = await service.listTickets(input.scope, input);
        return {
          items: result.items,
          ...(result.nextCursor === undefined ? {} : { next_cursor: result.nextCursor }),
        };
      }),
  );

  server.registerTool(
    'get_ticket',
    {
      description: 'Get one Ticket by its globally unique ID.',
      inputSchema: z.object({ id: z.string().min(1) }).strict(),
    },
    async ({ id }) => runTool(async () => ({ ticket: await service.getTicket(id) })),
  );

  server.registerTool(
    'create_ticket',
    {
      description: 'Create a mutable current-state Ticket.',
      inputSchema: z
        .object({
          scope: z.string().min(1),
          title: z.string().min(1),
          status: z.string().min(1).optional(),
          created_by: z.string().min(1),
          artifact_ids: artifactIdsSchema,
          meta: metadataSchema,
        })
        .strict(),
    },
    async input => runTool(async () => ({ ticket: await service.createTicket(input) })),
  );

  server.registerTool(
    'update_ticket',
    {
      description: 'Update mutable fields on an existing Ticket.',
      inputSchema: z
        .object({
          id: z.string().min(1),
          title: z.string().min(1).optional(),
          status: z.string().min(1).optional(),
          artifact_ids: artifactIdsSchema,
          meta: metadataSchema,
        })
        .strict(),
    },
    async ({ id, ...input }) => runTool(async () => ({ ticket: await service.updateTicket(id, input) })),
  );

  server.registerTool(
    'list_updates',
    {
      description: 'List immutable Updates for incremental Scope synchronization.',
      inputSchema: z
        .object({
          scope: z.string().min(1),
          after_seq: z.number().int().min(0).optional(),
          ticket_id: z.string().min(1).optional(),
          type: z.string().min(1).optional(),
          limit: z.number().int().min(1).max(100).optional(),
        })
        .strict(),
    },
    async ({ scope, after_seq, ticket_id, type, limit }) =>
      runTool(async () => {
        const result = await service.listUpdates(scope, {
          afterSeq: after_seq,
          ticketId: ticket_id,
          type,
          limit,
        });
        return {
          updates: result.updates,
          latest_seq: result.latestSeq,
          has_more: result.hasMore,
        };
      }),
  );

  server.registerTool(
    'add_update',
    {
      description: 'Append an immutable Update to a Scope timeline.',
      inputSchema: z
        .object({
          scope: z.string().min(1),
          ticket_id: z.string().min(1).optional(),
          type: z.string().min(1),
          body: z.string().min(1),
          created_by: z.string().min(1),
          artifact_ids: artifactIdsSchema,
          meta: metadataSchema,
        })
        .strict(),
    },
    async input => runTool(async () => ({ update: await service.addUpdate(input) })),
  );

  server.registerTool(
    'create_artifact',
    {
      description: 'Create immutable shared textual content.',
      inputSchema: z
        .object({
          scope: z.string().min(1),
          media_type: z.string().min(1),
          content: z.string(),
          created_by: z.string().min(1),
          meta: metadataSchema,
        })
        .strict(),
    },
    async input => runTool(async () => ({ artifact: await service.createArtifact(input) })),
  );

  server.registerTool(
    'get_artifact',
    {
      description: 'Get one immutable Artifact by its globally unique ID.',
      inputSchema: z.object({ id: z.string().min(1) }).strict(),
    },
    async ({ id }) => runTool(async () => ({ artifact: await service.getArtifact(id) })),
  );

  return server;
}

export const createMcpRequestHandler = (service: CoordinationService) =>
  createMcpHandler(() => createMcpServer(service), { legacy: 'stateless' });

async function runTool(operation: () => Promise<unknown>) {
  try {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(await operation()) }],
    };
  } catch (error) {
    const coordinationError = toCoordinationError(error);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: {
              code: coordinationError.code,
              message: coordinationError.message,
            },
          }),
        },
      ],
      isError: true,
    };
  }
}

function toCoordinationError(error: unknown): CoordinationError {
  if (error instanceof CoordinationError) {
    return error;
  }
  return new CoordinationError('INTERNAL_ERROR', 'Internal server error', { cause: error });
}
