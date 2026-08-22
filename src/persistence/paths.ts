import { join } from 'node:path';

export function encodeScope(scope: string): string {
  return Buffer.from(scope, 'utf8').toString('base64url');
}

export function scopeDirectory(dataDirectory: string, scope: string): string {
  return join(dataDirectory, 'scopes', encodeScope(scope));
}

export function ticketsDirectory(dataDirectory: string, scope: string): string {
  return join(scopeDirectory(dataDirectory, scope), 'tickets');
}

export function updatesFile(dataDirectory: string, scope: string): string {
  return join(scopeDirectory(dataDirectory, scope), 'updates.jsonl');
}

export function artifactsDirectory(dataDirectory: string, scope: string): string {
  return join(scopeDirectory(dataDirectory, scope), 'artifacts');
}
