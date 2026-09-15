/**
 * Server-side precompilation.
 *
 * Sucrase runs just as happily in Node, so a host serving many stored snippets
 * can transpile once, cache by content hash, and ship ready JavaScript to the
 * browser, the client then never downloads the transpiler at all.
 *
 * This entry deliberately carries no `'use client'` directive and pulls in no
 * React, so it is safe to import from a Route Handler or a Server Component.
 */
import { transform } from 'sucrase';
import { defaultTranspileOptions, runTranspile } from './core/transpile';
import type { TranspileMode } from './core/transpile';
import { LiveCompileError } from './core/errors';
import { normalizeFiles, resolveEntry } from './core/project';
import type { TransformResult, TranspileOptions } from './core/types';

export interface PrecompileResult extends TransformResult {
  /** Stable hash of source + options. Use it as a cache key or ETag. */
  hash: string;
}

/**
 * Transpiles a snippet to the same CommonJS the browser path produces.
 *
 * Only the `export default` / bare-statement forms are handled here; a bare
 * expression snippet (`<div/>`) is wrapped exactly as the client wraps it, so
 * the two paths stay interchangeable.
 */
export function precompile(source: string, options: TranspileOptions = {}): PrecompileResult {
  return precompileSource(source, options, 'auto');
}

export interface PrecompileFilesOptions extends TranspileOptions {
  /** The file whose exports are rendered. Default: the first key. */
  entry?: string;
}

export interface PrecompileFilesResult {
  /** One result per file, keyed exactly as the `files` you passed in. */
  files: Record<string, PrecompileResult>;
  /** The entry file's key. */
  entry: string;
  /** Stable hash of the whole project. Changes when any file or the entry does. */
  hash: string;
}

/**
 * Precompiles every file of a multi-file snippet, for
 * `precompiledTransform(result.files)` on the client.
 *
 * ```ts
 * const compiled = precompileFiles({ 'App.tsx': app, 'Button.tsx': button });
 * // client: <LiveProvider files={files} transform={precompiledTransform(compiled.files)} />
 * ```
 *
 * Every file is compiled, not just the ones the entry imports: the server
 * cannot know which a later edit will reach, and a stale cache is worse than a
 * few milliseconds of extra work.
 */
export function precompileFiles(
  files: Readonly<Record<string, string>>,
  options: PrecompileFilesOptions = {},
): PrecompileFilesResult {
  const { entry: entryName, ...transpileOptions } = options;
  const project = normalizeFiles(files);
  const entry = resolveEntry(project, entryName);

  const results: Record<string, PrecompileResult> = {};
  for (const [path, file] of project) {
    results[file.key] = precompileSource(
      file.source,
      { ...transpileOptions, filePath: file.key },
      path === entry ? 'auto' : 'module',
      file.key,
    );
  }

  const entryKey = (project.get(entry) as { key: string }).key;
  // Sorted, so the same project hashes the same whatever order its keys were in.
  const perFile = Object.keys(results)
    .sort()
    .map((key) => `${key}\0${(results[key] as PrecompileResult).hash}`)
    .join('\n');

  return { files: results, entry: entryKey, hash: fnv1a(`${entryKey}\n${perFile}`) };
}

function precompileSource(
  source: string,
  options: TranspileOptions,
  mode: TranspileMode,
  file?: string,
): PrecompileResult {
  const resolved = { ...defaultTranspileOptions, ...options };

  try {
    // The exact same pass the browser runs, so a precompiled result and a
    // client-compiled one are interchangeable.
    const result = runTranspile(transform, source, resolved, mode);
    return { ...result, hash: hashOf(source, resolved, mode) };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const match = /\((\d+):(\d+)\)\s*$/.exec(message);
    throw match
      ? new LiveCompileError(
          message.slice(0, match.index).trim(),
          {
            line: Number(match[1]),
            column: Number(match[2]),
            ...(file !== undefined ? { file } : {}),
          },
          cause,
        )
      : new LiveCompileError(message, file !== undefined ? { file } : undefined, cause);
  }
}

/**
 * FNV-1a over the source and the options that affect output. Not a
 * cryptographic hash - it only needs to be fast and collision-resistant enough
 * to key a cache.
 *
 * Module mode is only mixed in when used, so `precompile()` hashes exactly as
 * it always has and existing caches stay warm.
 */
function hashOf(source: string, options: Required<TranspileOptions>, mode: TranspileMode): string {
  const modeTag = mode === 'module' ? '|module' : '';
  return fnv1a(`${options.jsxRuntime}|${options.jsxImportSource}|${options.production}${modeTag}|${source}`);
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export { LiveCompileError } from './core/errors';
export { validateFiles, validateSnippet, validateSnippets } from './validate';
export type {
  FileValidationIssue,
  FilesValidationResult,
  ValidateFilesOptions,
  ValidateOptions,
  ValidationIssue,
  ValidationIssueKind,
  ValidationResult,
} from './validate';
export type { TransformResult, TranspileOptions } from './core/types';
