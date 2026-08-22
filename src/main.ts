import { loadConfig } from './config/config.js';
import { CoordinationService } from './application/coordination-service.js';
import { FileArtifactStore } from './persistence/file-artifact-store.js';
import { FileStateStore } from './persistence/file-state-store.js';
import {
  closeServer,
  createCoordinationHttpServer,
  listenOnLoopback,
} from './transport/http-server.js';

const config = await loadConfig();
const service = new CoordinationService({
  stateStore: new FileStateStore(config.dataDirectory),
  artifactStore: new FileArtifactStore(config.dataDirectory),
});
const server = createCoordinationHttpServer(service, {
  allowedHosts: config.allowedHosts,
});

await listenOnLoopback(server, config.port);
const address = server.address();
if (address === null || typeof address === 'string') {
  throw new Error('Coordination MCP server did not expose a listening address');
}

console.error(`Coordination MCP listening on http://127.0.0.1:${address.port}/mcp`);
console.error(`Coordination data directory: ${config.dataDirectory}`);

const shutdown = async () => {
  await closeServer(server);
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
