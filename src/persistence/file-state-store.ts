import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ListTicketsOptions,
  ListTicketsResult,
  ListUpdatesOptions,
  ListUpdatesResult,
  StateStore,
  Ticket,
  Update,
} from '../domain/model.js';
import {
  readDirectoryIfExists,
  readJsonFile,
  readTextFileIfExists,
  writeJsonAtomically,
} from './file-utils.js';
import { scopeDirectory, ticketsDirectory, updatesFile } from './paths.js';

export class FileStateStore implements StateStore {
  constructor(private readonly dataDirectory: string) {}

  async createTicket(ticket: Ticket): Promise<void> {
    await this.saveTicket(ticket);
  }

  async getTicket(id: string): Promise<Ticket | undefined> {
    const scopeEntries = await readDirectoryIfExists(join(this.dataDirectory, 'scopes'));

    for (const scopeEntry of scopeEntries) {
      if (!scopeEntry.isDirectory()) {
        continue;
      }

      const ticket = await readJsonFile<Ticket>(
        join(this.dataDirectory, 'scopes', scopeEntry.name, 'tickets', `${id}.json`),
      );
      if (ticket !== undefined) {
        return ticket;
      }
    }

    return undefined;
  }

  async listTickets(scope: string, options: ListTicketsOptions): Promise<ListTicketsResult> {
    const entries = await readDirectoryIfExists(ticketsDirectory(this.dataDirectory, scope));
    const cursor = options.cursor === undefined ? undefined : decodeCursor(options.cursor);
    const tickets: Ticket[] = [];

    for (const entry of entries.filter(entry => entry.isFile() && entry.name.endsWith('.json'))) {
      const ticket = await readJsonFile<Ticket>(join(ticketsDirectory(this.dataDirectory, scope), entry.name));
      if (ticket !== undefined) {
        tickets.push(ticket);
      }
    }

    tickets.sort((left, right) => left.id.localeCompare(right.id));

    const matchingTickets = tickets.filter(ticket => {
      if (cursor !== undefined && ticket.id <= cursor) {
        return false;
      }
      return options.status === undefined || ticket.status === options.status;
    });
    const limit = options.limit ?? 50;
    const items = matchingTickets.slice(0, limit);

    return {
      items,
      ...(matchingTickets.length > limit && items.length > 0
        ? { nextCursor: encodeCursor(items[items.length - 1].id) }
        : {}),
    };
  }

  async saveTicket(ticket: Ticket): Promise<void> {
    await writeJsonAtomically(
      join(ticketsDirectory(this.dataDirectory, ticket.scope), `${ticket.id}.json`),
      ticket,
    );
  }

  async getLatestUpdateSeq(scope: string): Promise<number> {
    const updates = await this.readUpdates(scope);
    return updates.reduce((latest, update) => Math.max(latest, update.seq), 0);
  }

  async appendUpdate(update: Update): Promise<void> {
    const filePath = updatesFile(this.dataDirectory, update.scope);
    await mkdir(scopeDirectory(this.dataDirectory, update.scope), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(update)}\n`, 'utf8');
  }

  async listUpdates(scope: string, options: ListUpdatesOptions): Promise<ListUpdatesResult> {
    const updates = await this.readUpdates(scope);
    const latestSeq = updates.reduce((latest, update) => Math.max(latest, update.seq), 0);
    const afterSeq = options.afterSeq ?? 0;
    const matchingUpdates = updates
      .filter(update => update.seq > afterSeq)
      .filter(update => options.ticketId === undefined || update.ticket_id === options.ticketId)
      .filter(update => options.type === undefined || update.type === options.type)
      .sort((left, right) => left.seq - right.seq);
    const limit = options.limit ?? 50;

    return {
      updates: matchingUpdates.slice(0, limit),
      latestSeq,
      hasMore: matchingUpdates.length > limit,
    };
  }

  private async readUpdates(scope: string): Promise<Update[]> {
    const content = await readTextFileIfExists(updatesFile(this.dataDirectory, scope));
    if (content === undefined || content.length === 0) {
      return [];
    }

    return content
      .split('\n')
      .filter(line => line.length > 0)
      .map(line => JSON.parse(line) as Update);
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64url').toString('utf8');
}
