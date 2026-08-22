import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
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

    await expect(loadConfig({ cwd, homeDirectory: cwd, env: {} })).resolves.toEqual({
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
      loadConfig({ cwd, homeDirectory: cwd, args: ['--profile', 'config/local.yml'], env: {} }),
    ).resolves.toEqual({
      port: 3200,
      dataDirectory: resolve(cwd, 'profile-data'),
      allowedHosts: ['profile.example'],
    });
    await expect(
      loadConfig({
        cwd,
        homeDirectory: cwd,
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

  it('loads an optional user config over repository defaults without creating it', async () => {
    const cwd = await createConfigDirectory(
      'port: 3100\ndataDirectory: default-data\nallowedHosts:\n  - default.example\n',
    );
    const homeDirectory = await mkdtemp(join(tmpdir(), 'coordination-mcp-home-'));
    temporaryDirectories.push(homeDirectory);
    await mkdir(join(homeDirectory, '.coordination-mcp'), { recursive: true });
    await writeFile(
      join(homeDirectory, '.coordination-mcp', 'config.yml'),
      'port: 3200\ndataDirectory: user-data\nallowedHosts:\n  - user.example\n',
      'utf8',
    );
    await writeFile(
      join(cwd, 'config', 'profile.yml'),
      'port: 3300\ndataDirectory: profile-data\nallowedHosts:\n  - profile.example\n',
      'utf8',
    );

    await expect(loadConfig({ cwd, homeDirectory, env: {} })).resolves.toEqual({
      port: 3200,
      dataDirectory: resolve(cwd, 'user-data'),
      allowedHosts: ['user.example'],
    });
    await expect(
      loadConfig({ cwd, homeDirectory, args: ['--profile', 'config/profile.yml'], env: {} }),
    ).resolves.toEqual({
      port: 3300,
      dataDirectory: resolve(cwd, 'profile-data'),
      allowedHosts: ['profile.example'],
    });

    const missingHomeDirectory = join(cwd, 'missing-home');
    await expect(loadConfig({ cwd, homeDirectory: missingHomeDirectory, env: {} })).resolves.toEqual({
      port: 3100,
      dataDirectory: resolve(cwd, 'default-data'),
      allowedHosts: ['default.example'],
    });
    await expect(stat(missingHomeDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('uses the user home data directory when no YAML overrides it', async () => {
    const cwd = await createConfigDirectory('port: 3100\nallowedHosts: []\n');
    const homeDirectory = await mkdtemp(join(tmpdir(), 'coordination-mcp-home-'));
    temporaryDirectories.push(homeDirectory);

    await expect(loadConfig({ cwd, homeDirectory, env: {} })).resolves.toEqual({
      port: 3100,
      dataDirectory: resolve(homeDirectory, '.coordination-mcp', 'data'),
      allowedHosts: [],
    });
  });

  it('accepts --profile=path and rejects unknown options', async () => {
    const cwd = await createConfigDirectory('port: 3100\ndataDirectory: data\nallowedHosts: []\n');

    await expect(
      loadConfig({ cwd, homeDirectory: cwd, args: ['--profile=config/default.yml'], env: {} }),
    ).resolves.toMatchObject({ port: 3100 });
    await expect(loadConfig({ cwd, homeDirectory: cwd, args: ['--unknown'], env: {} })).rejects.toThrow(
      'Unknown option: --unknown',
    );
    await expect(
      loadConfig({ cwd, homeDirectory: cwd, args: ['--profile', 'config/missing.yml'], env: {} }),
    ).rejects.toThrow('Unable to read configuration file');
  });

  async function createConfigDirectory(defaultConfig: string): Promise<string> {
    const cwd = await mkdtemp(join(tmpdir(), 'coordination-mcp-config-'));
    temporaryDirectories.push(cwd);
    await mkdir(join(cwd, 'config'), { recursive: true });
    await writeFile(join(cwd, 'config', 'default.yml'), defaultConfig, 'utf8');
    return cwd;
  }
});
