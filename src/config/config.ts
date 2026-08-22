import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';

export interface AppConfig {
  port: number;
  dataDirectory: string;
  allowedHosts: string[];
}

export interface LoadConfigOptions {
  args?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export class ConfigurationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConfigurationError';
  }
}

type ConfigValues = Partial<AppConfig>;

export const DEFAULT_CONFIG: Readonly<AppConfig> = {
  port: 3000,
  dataDirectory: 'data',
  allowedHosts: ['127.0.0.1', 'localhost'],
};

const CONFIG_KEYS = new Set(['port', 'dataDirectory', 'allowedHosts']);

export async function loadConfig(options: LoadConfigOptions = {}): Promise<AppConfig> {
  const cwd = options.cwd ?? process.cwd();
  const args = options.args ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const profilePath = parseProfilePath(args);

  let values = cloneConfig(DEFAULT_CONFIG);
  values = mergeConfig(values, await readConfigFile(resolve(cwd, 'config/default.yml'), false));
  if (profilePath !== undefined) {
    values = mergeConfig(values, await readConfigFile(resolve(cwd, profilePath), true));
  }
  values = mergeConfig(values, readEnvironmentConfig(env));

  return {
    port: values.port ?? DEFAULT_CONFIG.port,
    dataDirectory: resolve(cwd, values.dataDirectory ?? DEFAULT_CONFIG.dataDirectory),
    allowedHosts: [...(values.allowedHosts ?? DEFAULT_CONFIG.allowedHosts)],
  };
}

function parseProfilePath(args: readonly string[]): string | undefined {
  let profilePath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--profile') {
      if (profilePath !== undefined) {
        throw new ConfigurationError('The --profile option can only be specified once');
      }
      const nextArgument = args[index + 1];
      if (nextArgument === undefined || nextArgument.startsWith('--')) {
        throw new ConfigurationError('--profile requires a YAML file path');
      }
      profilePath = nextArgument;
      index += 1;
      continue;
    }

    if (argument.startsWith('--profile=')) {
      if (profilePath !== undefined) {
        throw new ConfigurationError('The --profile option can only be specified once');
      }
      const value = argument.slice('--profile='.length);
      if (value.length === 0) {
        throw new ConfigurationError('--profile requires a YAML file path');
      }
      profilePath = value;
      continue;
    }

    throw new ConfigurationError(`Unknown option: ${argument}`);
  }

  return profilePath;
}

async function readConfigFile(filePath: string, required: boolean): Promise<ConfigValues> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (!required && isNodeError(error) && error.code === 'ENOENT') {
      return {};
    }
    throw new ConfigurationError(`Unable to read configuration file: ${filePath}`, {
      cause: error,
    });
  }

  let parsed: unknown;
  try {
    parsed = parse(content);
  } catch (error) {
    throw new ConfigurationError(`Unable to parse configuration file: ${filePath}`, {
      cause: error,
    });
  }

  return validateConfigValues(parsed, filePath);
}

function validateConfigValues(value: unknown, source: string): ConfigValues {
  if (value === null || value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new ConfigurationError(`Configuration must be a YAML mapping: ${source}`);
  }

  for (const key of Object.keys(value)) {
    if (!CONFIG_KEYS.has(key)) {
      throw new ConfigurationError(`Unknown configuration key in ${source}: ${key}`);
    }
  }

  const values: ConfigValues = {};
  if ('port' in value) {
    values.port = validatePort(value.port, `${source}:port`);
  }
  if ('dataDirectory' in value) {
    values.dataDirectory = validateNonEmptyString(value.dataDirectory, `${source}:dataDirectory`);
  }
  if ('allowedHosts' in value) {
    if (!Array.isArray(value.allowedHosts)) {
      throw new ConfigurationError(`${source}:allowedHosts must be a YAML list`);
    }
    values.allowedHosts = value.allowedHosts.map((host, index) =>
      validateNonEmptyString(host, `${source}:allowedHosts[${index}]`),
    );
  }

  return values;
}

function readEnvironmentConfig(env: NodeJS.ProcessEnv): ConfigValues {
  const values: ConfigValues = {};
  if (env.PORT !== undefined) {
    values.port = validatePort(Number(env.PORT), 'environment variable PORT');
    if (!/^\d+$/.test(env.PORT)) {
      throw new ConfigurationError('environment variable PORT must be an integer');
    }
  }
  if (env.COORDINATION_DATA_DIR !== undefined) {
    values.dataDirectory = validateNonEmptyString(
      env.COORDINATION_DATA_DIR,
      'environment variable COORDINATION_DATA_DIR',
    );
  }
  if (env.COORDINATION_ALLOWED_HOSTS !== undefined) {
    values.allowedHosts = env.COORDINATION_ALLOWED_HOSTS
      .split(',')
      .map(host => host.trim())
      .filter(host => host.length > 0);
  }
  return values;
}

function mergeConfig(base: AppConfig, overrides: ConfigValues): AppConfig {
  return {
    port: overrides.port ?? base.port,
    dataDirectory: overrides.dataDirectory ?? base.dataDirectory,
    allowedHosts: overrides.allowedHosts === undefined ? base.allowedHosts : [...overrides.allowedHosts],
  };
}

function cloneConfig(config: Readonly<AppConfig>): AppConfig {
  return {
    ...config,
    allowedHosts: [...config.allowedHosts],
  };
}

function validatePort(value: unknown, source: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 65535) {
    throw new ConfigurationError(`${source} must be an integer between 0 and 65535`);
  }
  return value;
}

function validateNonEmptyString(value: unknown, source: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ConfigurationError(`${source} must be a non-empty string`);
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
