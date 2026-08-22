import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/config.js';

describe('configuration loading', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(directory =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it('loads config/default.yml when no profile is selected', async () => {
    const cwd = await createConfigDirectory('port: 3100\ndataDirectory: default-data\nallowedHosts:\n  - default.example\n');

    await expect(loadConfig({ cwd, env: {} })).resolves.toEqual({
      port: 3100,
      dataDirectory: resolve(cwd, 'default-data'),
      allowedHosts: ['default.example'],
    });
  });

  it('applies profile YAML over defaults and environment variables last', async () => {
    const cwd = await createConfigDirectory(
      'port: 3100\ndataDirectory: default-data\nallowedHosts:\n  - default.example\n',
    );
    const profilePath = join(cwd, 'config', 'local.yml');
    await writeFile(
      profilePath,
      'port: 3200\ndataDirectory: profile-data\nallowedHosts:\n  - profile.example\n',
      'utf8',
    );

    await expect(
      loadConfig({ cwd, args: ['--profile', 'config/local.yml'], env: {} }),
    ).resolves.toEqual({
      port: 3200,
      dataDirectory: resolve(cwd, 'profile-data'),
      allowedHosts: ['profile.example'],
    });
    await expect(
      loadConfig({
        cwd,
        args: ['--profile', 'config/local.yml'],
        env: {
          PORT: '3300',
          COORDINATION_DATA_DIR: 'env-data',
          COORDINATION_ALLOWED_HOSTS: 'env.example, localhost',
        },
      }),
    ).resolves.toEqual({
      port: 3300,
      dataDirectory: resolve(cwd, 'env-data'),
      allowedHosts: ['env.example', 'localhost'],
    });
  });

  it('accepts --profile=path and rejects unknown options', async () => {
    const cwd = await createConfigDirectory('port: 3100\ndataDirectory: data\nallowedHosts: []\n');

    await expect(
      loadConfig({ cwd, args: ['--profile=config/default.yml'], env: {} }),
    ).resolves.toMatchObject({ port: 3100 });
    await expect(loadConfig({ cwd, args: ['--unknown'], env: {} })).rejects.toThrow(
      'Unknown option: --unknown',
    );
  });

  async function createConfigDirectory(defaultConfig: string): Promise<string> {
    const cwd = await mkdtemp(join(tmpdir(), 'coordination-mcp-config-'));
    temporaryDirectories.push(cwd);
    await mkdir(join(cwd, 'config'), { recursive: true });
    await writeFile(join(cwd, 'config', 'default.yml'), defaultConfig, 'utf8');
    return cwd;
  }
});
