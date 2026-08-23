import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';

export async function readDirectoryIfExists(directory: string) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function readTextFileIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  const content = await readTextFileIfExists(filePath);
  return content === undefined ? undefined : (JSON.parse(content) as T);
}

export async function readJsonFileByName<T>(directory: string, fileName: string): Promise<T | undefined> {
  const entries = await readDirectoryIfExists(directory);
  const entry = entries.find(candidate => candidate.isFile() && candidate.name === fileName);
  return entry === undefined ? undefined : readJsonFile<T>(join(directory, entry.name));
}

export async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = join(dirname(filePath), `.${basename(filePath)}.${randomUUID()}.tmp`);

  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
