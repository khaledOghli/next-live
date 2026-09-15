import { LiveCompileError } from './errors';

/** One file of a multi-file snippet, keyed by its normalized path. */
export interface ProjectFile {
  /** The key exactly as the host wrote it. Every error and callback reports this. */
  key: string;
  source: string;
}

/** Normalized path → file. Insertion order follows the host's object. */
export type ProjectFiles = Map<string, ProjectFile>;

/** Tried, in order, after an exact match - the same order bundlers use. */
export const PROJECT_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'] as const;

/**
 * Collapses a path to `a/b/c.tsx`: backslashes become slashes, leading `./`
 * and `/` go, `.` and `..` segments are resolved.
 *
 * Returns null for a path that climbs above the project root, because there is
 * nothing above it to resolve against.
 */
export function normalizeProjectPath(path: string): string | null {
  const segments: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  return segments.join('/');
}

/**
 * Validates and indexes a `files` record.
 *
 * Throws rather than guessing when two keys would be the same file (`App.tsx`
 * and `./App.tsx`), since either choice would silently ignore one of them.
 */
export function normalizeFiles(files: Readonly<Record<string, string>>): ProjectFiles {
  const map: ProjectFiles = new Map();

  for (const [key, source] of Object.entries(files)) {
    if (typeof source !== 'string') {
      throw new LiveCompileError(`File '${key}' must be a string of source code.`, { file: key });
    }

    const path = normalizeProjectPath(key);
    if (path === null) {
      throw new LiveCompileError(`File path '${key}' escapes the project root.`, { file: key });
    }
    if (path === '') {
      throw new LiveCompileError(`File path '${key}' does not name a file.`, { file: key });
    }

    const existing = map.get(path);
    if (existing) {
      throw new LiveCompileError(
        `Files '${existing.key}' and '${key}' both resolve to '${path}'.`,
        { file: key },
      );
    }

    map.set(path, { key, source });
  }

  return map;
}

/** Relative to the importing file (`./`, `../`) or to the project root (`/`). */
export function isProjectSpecifier(specifier: string): boolean {
  return (
    specifier === '.' ||
    specifier === '..' ||
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    specifier.startsWith('/')
  );
}

/**
 * The normalized path of the project file an import refers to, or undefined.
 *
 * Bare specifiers (`react`, `@app/ui`) never resolve to files - those belong
 * to the module registry, and keeping the two namespaces apart means a file
 * called `react.tsx` cannot hijack an import of React.
 */
export function resolveProjectSpecifier(
  importer: string,
  specifier: string,
  files: ProjectFiles,
): string | undefined {
  if (!isProjectSpecifier(specifier)) return undefined;

  const base = specifier.startsWith('/') ? '' : dirname(importer);
  const target = normalizeProjectPath(base ? `${base}/${specifier}` : specifier);
  if (target === null) return undefined;

  const candidates: string[] = [];
  if (target !== '') {
    candidates.push(target, ...PROJECT_EXTENSIONS.map((extension) => `${target}${extension}`));
  }
  const indexBase = target === '' ? 'index' : `${target}/index`;
  candidates.push(...PROJECT_EXTENSIONS.map((extension) => `${indexBase}${extension}`));

  return candidates.find((candidate) => files.has(candidate));
}

/**
 * The entry file's normalized path: the one named, or the first key in the
 * host's object when none is.
 */
export function resolveEntry(files: ProjectFiles, entry?: string): string {
  const keys = () => [...files.values()].map((file) => file.key).join(', ');

  if (entry !== undefined) {
    const path = normalizeProjectPath(entry);
    if (path === null || !files.has(path)) {
      throw new LiveCompileError(`Entry file '${entry}' is not one of the project files: ${keys()}.`);
    }
    return path;
  }

  const first = files.keys().next();
  if (first.done) throw new LiveCompileError('A multi-file snippet needs at least one file.');
  return first.value;
}

/**
 * How an importer would refer to `path`, for "did you mean" suggestions:
 * `../lib/format` from `components/Card.tsx`, with the extension dropped.
 */
export function relativeSpecifier(importer: string, path: string): string {
  const from = dirname(importer).split('/').filter(Boolean);
  const to = path.replace(/\.(?:tsx|ts|jsx|js)$/, '').split('/');

  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared++;

  const up = from.length - shared;
  const rest = to.slice(shared).join('/');
  return up === 0 ? `./${rest}` : `${'../'.repeat(up)}${rest}`;
}

function dirname(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}
