export type Metadata = Record<string, unknown>;

export interface Ticket {
  id: string;
  scope: string;
  title: string;
  status: string;
  created_by: string;
  created_at: string;
  artifact_ids?: string[];
  meta?: Metadata;
}

export interface Update {
  id: string;
  scope: string;
  seq: number;
  ticket_id?: string;
  type: string;
  body: string;
  created_by: string;
  created_at: string;
  artifact_ids?: string[];
  meta?: Metadata;
}

export interface Artifact {
  id: string;
  scope: string;
  media_type: string;
  content: string;
  created_by: string;
  created_at: string;
  meta?: Metadata;
}

export interface CreateTicketInput {
  scope: string;
  title: string;
  status?: string;
  created_by: string;
  artifact_ids?: string[];
  meta?: Metadata;
}

export interface UpdateTicketInput {
  title?: string;
  status?: string;
  artifact_ids?: string[];
  meta?: Metadata;
}

export interface AddUpdateInput {
  scope: string;
  ticket_id?: string;
  type: string;
  body: string;
  created_by: string;
  artifact_ids?: string[];
  meta?: Metadata;
}

export interface CreateArtifactInput {
  scope: string;
  media_type: string;
  content: string;
  created_by: string;
  meta?: Metadata;
}

export interface ListTicketsOptions {
  status?: string;
  limit?: number;
  cursor?: string;
}

export interface ListTicketsResult {
  items: Ticket[];
  nextCursor?: string;
}

export interface ListUpdatesOptions {
  afterSeq?: number;
  ticketId?: string;
  type?: string;
  limit?: number;
}

export interface ListUpdatesResult {
  updates: Update[];
  latestSeq: number;
  hasMore: boolean;
}

export interface StateStore {
  createTicket(ticket: Ticket): Promise<void>;
  getTicket(id: string): Promise<Ticket | undefined>;
  listTickets(scope: string, options: ListTicketsOptions): Promise<ListTicketsResult>;
  saveTicket(ticket: Ticket): Promise<void>;
  getLatestUpdateSeq(scope: string): Promise<number>;
  appendUpdate(update: Update): Promise<void>;
  listUpdates(scope: string, options: ListUpdatesOptions): Promise<ListUpdatesResult>;
}

export interface ArtifactStore {
  saveArtifact(artifact: Artifact): Promise<void>;
  getArtifact(id: string): Promise<Artifact | undefined>;
}
