import { resolve } from 'node:path';
import { CoordinationService } from './application/coordination-service.js';
import { FileArtifactStore } from './persistence/file-artifact-store.js';
import { FileStateStore } from './persistence/file-state-store.js';
import {
  closeServer,
  createCoordinationHttpServer,
  listenOnLoopback,
} from './transport/http-server.js';

const dataDirectory = resolve(process.env.COORDINATION_DATA_DIR ?? 'data');
const service = new CoordinationService({
  stateStore: new FileStateStore(dataDirectory),
  artifactStore: new FileArtifactStore(dataDirectory),
});
const server = createCoordinationHttpServer(service);

await listenOnLoopback(server);
const address = server.address();
if (address === null || typeof address === 'string') {
  throw new Error('Coordination MCP server did not expose a listening address');
}

console.error(`Coordination MCP listening on http://127.0.0.1:${address.port}/mcp`);
console.error(`Coordination data directory: ${dataDirectory}`);

const shutdown = async () => {
  await closeServer(server);
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
