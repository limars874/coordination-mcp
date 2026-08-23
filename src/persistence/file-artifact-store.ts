import { join } from 'node:path';
import type { Artifact, ArtifactStore } from '../domain/model.js';
import { readDirectoryIfExists, readJsonFileByName, writeJsonAtomically } from './file-utils.js';
import { artifactsDirectory } from './paths.js';

export class FileArtifactStore implements ArtifactStore {
  constructor(private readonly dataDirectory: string) {}

  async saveArtifact(artifact: Artifact): Promise<void> {
    await writeJsonAtomically(
      join(artifactsDirectory(this.dataDirectory, artifact.scope), `${artifact.id}.json`),
      artifact,
    );
  }

  async getArtifact(id: string): Promise<Artifact | undefined> {
    const scopeEntries = await readDirectoryIfExists(join(this.dataDirectory, 'scopes'));

    for (const scopeEntry of scopeEntries) {
      if (!scopeEntry.isDirectory()) {
        continue;
      }

      const artifact = await readJsonFileByName<Artifact>(
        join(this.dataDirectory, 'scopes', scopeEntry.name, 'artifacts'),
        `${id}.json`,
      );
      if (artifact !== undefined) {
        return artifact;
      }
    }

    return undefined;
  }
}
