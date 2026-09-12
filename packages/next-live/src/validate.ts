/**
 * Static validation of stored snippets.
 *
 * The problem this solves: with snippets stored in a database, renaming
 * something in your SDK breaks them silently — the failure surfaces for
 * whoever opens that app next, not for the person who made the change. Run
 * this over every stored snippet in CI and the rename fails the build instead.
 *
 * Deliberately **static**: it transpiles and checks specifiers, but never
 * evaluates. That means it is safe to run over untrusted content in CI, needs
 * no DOM, and cannot be tripped up by a snippet's side effects. The trade-off
 * is that runtime errors are not caught — only syntax errors and imports that
 * would fail to resolve.
 *
 * Exported from the server entry only — `next-live/server` — because it
 * imports Sucrase statically. Pulling it into the client entry would defeat
 * the code-splitting that keeps the transpiler out of your page bundle.
 */
import { transform } from 'sucrase';
import { LiveCompileError } from './core/errors';
import { nearestSpecifier } from './core/errors';
import { BUILTIN_SPECIFIERS } from './core/builtin-specifiers';
import { isIgnoredSpecifier, matchRegistryKey, scanRequires } from './core/resolver';
import { defaultTranspileOptions, runTranspile } from './core/transpile';
import type { ModuleRegistry, TranspileOptions } from './core/types';

export type ValidationIssueKind =
  | 'syntax'
  | 'unresolved-import'
  | 'source-too-large'
  | 'forbidden-import';

export interface ValidationIssue {
  kind: ValidationIssueKind;
  message: string;
  /** The import specifier, for import-related issues. */
  specifier?: string;
  /** The closest registered specifier, when one is close enough to suggest. */
  suggestion?: string;
  line?: number;
  column?: number;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  /** Every specifier the snippet imports, resolvable or not. */
  imports: string[];
}

export interface ValidateOptions extends TranspileOptions {
  /**
   * The registry a snippet will run against — either the registry object, or
   * just its keys. Keys alone are usually easier to share with a CI script,
   * since the real registry is full of bundler-specific dynamic imports.
   */
  modules?: ModuleRegistry | readonly string[];
  /** Reject snippets larger than this many UTF-8 bytes. Checked before transpile. */
  maxSourceBytes?: number;
  /** Treat `node:*` imports as forbidden rather than unresolved. */
  forbidNodeBuiltins?: boolean;
  /** Treat remote URL imports as forbidden. */
  forbidRemoteImports?: boolean;
  /**
   * Deny these specifiers even when registered. Prefix keys ending in `/`
   * deny a whole subtree, matching registry prefix semantics.
   */
  denySpecifiers?: readonly string[];
}

/**
 * Checks that a snippet compiles and that every module it imports is
 * registered.
 *
 * ```ts
 * const result = validateSnippet(app.source, { modules: Object.keys(liveModules) });
 * if (!result.ok) {
 *   console.error(app.id, result.issues);
 *   process.exitCode = 1;
 * }
 * ```
 */
export function validateSnippet(
  source: string,
  options: ValidateOptions = {},
): ValidationResult {
  const {
    modules,
    maxSourceBytes,
    forbidNodeBuiltins,
    forbidRemoteImports,
    denySpecifiers,
    ...transpileOptions
  } = options;
  const resolved = { ...defaultTranspileOptions, ...transpileOptions };

  const registryKeys = [
    ...BUILTIN_SPECIFIERS,
    ...(Array.isArray(modules) ? (modules as string[]) : Object.keys(modules ?? {})),
  ];

  if (maxSourceBytes !== undefined) {
    const bytes = new TextEncoder().encode(source).length;
    if (bytes > maxSourceBytes) {
      return {
        ok: false,
        issues: [
          {
            kind: 'source-too-large',
            message: `Snippet is ${bytes} bytes, exceeding the limit of ${maxSourceBytes}.`,
          },
        ],
        imports: [],
      };
    }
  }

  let code: string;
  try {
    code = runTranspile(transform, source, resolved).code;
  } catch (cause) {
    return { ok: false, issues: [syntaxIssue(cause)], imports: [] };
  }

  const imports = [...scanRequires(code)].sort();
  const issues: ValidationIssue[] = [];

  for (const specifier of imports) {
    const policyIssue = policyViolation(specifier, {
      forbidNodeBuiltins,
      forbidRemoteImports,
      denySpecifiers,
    });
    if (policyIssue) {
      issues.push(policyIssue);
      continue;
    }

    if (isIgnoredSpecifier(specifier)) continue;
    if (matchRegistryKey(specifier, registryKeys)) continue;

    const suggestion = nearestSpecifier(specifier, registryKeys);
    issues.push({
      kind: 'unresolved-import',
      specifier,
      message:
        `Module '${specifier}' is not registered.` +
        (suggestion ? ` Did you mean '${suggestion}'?` : ''),
      ...(suggestion ? { suggestion } : {}),
    });
  }

  return { ok: issues.length === 0, issues, imports };
}

function policyViolation(
  specifier: string,
  options: {
    forbidNodeBuiltins?: boolean;
    forbidRemoteImports?: boolean;
    denySpecifiers?: readonly string[];
  },
): ValidationIssue | null {
  if (options.forbidNodeBuiltins && specifier.startsWith('node:')) {
    return {
      kind: 'forbidden-import',
      specifier,
      message: `Import '${specifier}' is forbidden: Node built-ins are not available to snippets.`,
    };
  }

  if (
    options.forbidRemoteImports &&
    (/^https?:\/\//.test(specifier) || specifier.startsWith('//'))
  ) {
    return {
      kind: 'forbidden-import',
      specifier,
      message: `Import '${specifier}' is forbidden: remote modules are not available to snippets.`,
    };
  }

  if (options.denySpecifiers?.length) {
    const denied = matchRegistryKey(specifier, options.denySpecifiers);
    if (denied !== undefined) {
      return {
        kind: 'forbidden-import',
        specifier,
        message: `Import '${specifier}' is forbidden by policy (matched deny rule '${denied}').`,
      };
    }
  }

  return null;
}

/**
 * Validates many snippets at once, returning only the ones with problems.
 *
 * ```ts
 * const broken = validateSnippets(apps.map((a) => ({ id: a.id, source: a.source })), {
 *   modules: Object.keys(liveModules),
 * });
 * ```
 */
export function validateSnippets<T extends { id: string; source: string }>(
  snippets: readonly T[],
  options: ValidateOptions = {},
): Array<{ id: string; result: ValidationResult }> {
  const failures: Array<{ id: string; result: ValidationResult }> = [];
  for (const snippet of snippets) {
    const result = validateSnippet(snippet.source, {
      filePath: `${snippet.id}.tsx`,
      ...options,
    });
    if (!result.ok) failures.push({ id: snippet.id, result });
  }
  return failures;
}

function syntaxIssue(cause: unknown): ValidationIssue {
  const message = cause instanceof Error ? cause.message : String(cause);
  const match = /\((\d+):(\d+)\)\s*$/.exec(message);
  if (!match) return { kind: 'syntax', message };

  return {
    kind: 'syntax',
    message: message.slice(0, match.index).trim(),
    line: Number(match[1]),
    column: Number(match[2]),
  };
}

export { LiveCompileError };
