import { createServer, type IncomingMessage, type Server } from 'node:http';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { DEFAULT_CONFIG } from '../config/config.js';
import type { CoordinationService } from '../application/coordination-service.js';
import { createMcpRequestHandler } from './mcp-server.js';

export function createCoordinationHttpServer(
  service: CoordinationService,
  options: { allowedHosts?: string[] } = {},
): Server {
  const handler = toNodeHandler(createMcpRequestHandler(service));
  const allowedHosts = options.allowedHosts ?? DEFAULT_CONFIG.allowedHosts;

  return createServer((request, response) => {
    if (request.url?.split('?', 1)[0] !== '/mcp') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    if (!isAllowedHost(request, allowedHosts)) {
      response.writeHead(403, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Host is not allowed' }));
      return;
    }

    void handler(request, response).catch(error => {
      if (!response.headersSent) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'Internal server error' }));
      } else {
        response.destroy(error instanceof Error ? error : undefined);
      }
    });
  });
}

function isAllowedHost(request: IncomingMessage, allowedHosts: string[]): boolean {
  const hostHeader = request.headers.host;
  if (hostHeader === undefined) {
    return false;
  }
  const host = hostHeader.startsWith('[')
    ? hostHeader.slice(1, hostHeader.indexOf(']'))
    : hostHeader.split(':', 1)[0];
  return allowedHosts.includes(host);
}

export function listenOnLoopback(
  server: Server,
  port = DEFAULT_CONFIG.port,
): Promise<Server> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(server);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => (error === undefined ? resolve() : reject(error)));
  });
}
