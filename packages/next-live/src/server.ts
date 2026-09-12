/**
 * Server-side precompilation.
 *
 * Sucrase runs just as happily in Node, so a host serving many stored snippets
 * can transpile once, cache by content hash, and ship ready JavaScript to the
 * browser — the client then never downloads the transpiler at all.
 *
 * This entry deliberately carries no `'use client'` directive and pulls in no
 * React, so it is safe to import from a Route Handler or a Server Component.
 */
import { transform } from 'sucrase';
import { defaultTranspileOptions, runTranspile } from './core/transpile';
import { LiveCompileError } from './core/errors';
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
  const resolved = { ...defaultTranspileOptions, ...options };

  try {
    // The exact same pass the browser runs, so a precompiled result and a
    // client-compiled one are interchangeable.
    const result = runTranspile(transform, source, resolved);
    return { ...result, hash: hashOf(source, resolved) };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const match = /\((\d+):(\d+)\)\s*$/.exec(message);
    throw match
      ? new LiveCompileError(
          message.slice(0, match.index).trim(),
          { line: Number(match[1]), column: Number(match[2]) },
          cause,
        )
      : new LiveCompileError(message, undefined, cause);
  }
}

/**
 * FNV-1a over the source and the options that affect output. Not a
 * cryptographic hash — it only needs to be fast and collision-resistant enough
 * to key a cache.
 */
function hashOf(source: string, options: Required<TranspileOptions>): string {
  const input = `${options.jsxRuntime}|${options.jsxImportSource}|${options.production}|${source}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export { LiveCompileError } from './core/errors';
export { validateSnippet, validateSnippets } from './validate';
export type {
  ValidateOptions,
  ValidationIssue,
  ValidationIssueKind,
  ValidationResult,
} from './validate';
export type { TransformResult, TranspileOptions } from './core/types';
