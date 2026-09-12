import { ModuleNotFoundError } from './errors';
import type { ModuleLoader, ModuleRegistry, ModuleValue, NormalizedModule } from './types';

/** Marks a record that has already been through {@link normalizeModule}. */
const NORMALIZED = Symbol.for('next-live.normalized');

/** Marks a function as a lazy loader rather than the module value itself. */
const LOADER = Symbol.for('next-live.loader');

/** Assets a snippet may import for side effects only; resolved to empty modules. */
const ASSET_RE = /\.(css|scss|sass|less|styl|svg|png|jpe?g|gif|webp|avif|woff2?)$/i;

/**
 * Wraps a function so the registry treats it as a lazy loader instead of as
 * the module value. Without this a registered component function would be
 * indistinguishable from a loader.
 *
 * ```ts
 * { 'heavy-chart': defineLoader(() => import('heavy-chart')) }
 * ```
 */
export function defineLoader(load: ModuleLoader): ModuleLoader {
  return Object.defineProperty(load, LOADER, { value: true }) as ModuleLoader;
}

function isLoader(value: unknown): value is ModuleLoader {
  return typeof value === 'function' && (value as { [LOADER]?: boolean })[LOADER] === true;
}

/**
 * Builds an explicit module record, for the shape that cannot be inferred.
 *
 * {@link normalizeModule} unwraps any registered object that has its own
 * `default` key, because that is almost always a module wrapper. When it is
 * not - a config object that happens to contain the word `default`, say so:
 *
 * ```ts
 * { './theme': defineModule({ default: { default: 'dark', light: '#fff' } }) }
 * // import theme from './theme'  →  the whole object
 * ```
 *
 * `default` and `exports.default` address the same slot, because ESM makes no
 * distinction between a default export and a named export called `default`.
 * A top-level `default` wins if both are given.
 */
export function defineModule(shape: {
  default?: unknown;
  exports?: Record<string, unknown>;
}): NormalizedModule {
  const record = Object.create(null) as Record<string | symbol, unknown>;
  Object.defineProperty(record, '__esModule', { value: true });
  Object.defineProperty(record, NORMALIZED, { value: true });

  const defaultExport = 'default' in shape ? shape.default : shape.exports?.['default'];
  Object.defineProperty(record, 'default', { value: defaultExport, enumerable: true });

  for (const [key, value] of Object.entries(shape.exports ?? {})) {
    if (key === 'default') continue;
    Object.defineProperty(record, key, { value, enumerable: true });
  }
  return record as unknown as NormalizedModule;
}

/**
 * Converts a registered value into a record Sucrase's interop helpers accept.
 *
 * The trick that makes this total: both helpers Sucrase emits are identity
 * functions when the required value carries `__esModule === true` -
 * `_interopRequireDefault` is literally `obj && obj.__esModule ? obj : {default: obj}`.
 * By always returning such a record we neutralise both helpers, so this
 * function becomes the single source of truth for what `default` and each
 * named import resolve to.
 *
 * Named exports are exposed as *getters* over the original value rather than
 * copied. That preserves ES module live bindings, and - more importantly in
 * practice, avoids eagerly invoking the lazy namespace getters that packages
 * like icon sets and large UI barrels use, which a naive spread would trigger
 * on every single compile.
 */
export function normalizeModule(value: ModuleValue): NormalizedModule {
  if (isNormalized(value)) return value;

  if (value === null || value === undefined) {
    // A registered `undefined` is almost always a broken import on the host
    // side; surfacing it as an empty module beats a confusing downstream crash.
    return defineModule({ default: value });
  }

  if (typeof value !== 'object' && typeof value !== 'function') {
    return defineModule({ default: value });
  }

  const source = value as Record<string, unknown>;
  const record = Object.create(null) as Record<string | symbol, unknown>;
  Object.defineProperty(record, '__esModule', { value: true });
  Object.defineProperty(record, NORMALIZED, { value: true });

  // `in` rather than hasOwnProperty: bundler namespace objects can expose
  // `default` further up the chain. When a value carries its own `default`
  // it is module-shaped, so unwrap it; otherwise the value *is* the default.
  const defaultExport = 'default' in source ? source['default'] : source;
  Object.defineProperty(record, 'default', {
    get: () => defaultExport,
    enumerable: true,
    configurable: true,
  });

  for (const key of ownEnumerableKeys(source)) {
    if (key === 'default' || key === '__esModule') continue;
    Object.defineProperty(record, key, {
      get: () => source[key],
      enumerable: true,
      configurable: true,
    });
  }

  return record as unknown as NormalizedModule;
}

function isNormalized(value: unknown): value is NormalizedModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [NORMALIZED]?: boolean })[NORMALIZED] === true
  );
}

/**
 * Enumerable string keys, without invoking any getters. `Object.keys` alone
 * misses inherited enumerables on some bundlers' namespace objects.
 */
function ownEnumerableKeys(source: object): string[] {
  const keys = new Set<string>();
  for (const key of Object.keys(source)) keys.add(key);
  for (const key in source) keys.add(key);
  return [...keys];
}

/** The resolved, synchronously-readable module table handed to a snippet. */
export interface ResolvedModules {
  get(specifier: string): NormalizedModule | undefined;
  readonly keys: readonly string[];
}

export interface ResolveOptions {
  registry: ModuleRegistry;
  /** Specifiers found in the compiled output. */
  specifiers: Iterable<string>;
  /**
   * Resolve `@scope/pkg/Sub` against a registered `@scope/pkg` by walking the
   * remaining segments as property accesses. Correct for barrel-shaped
   * packages, wrong for those whose subpaths are not re-exported - so it is
   * opt-in rather than a silent guess. Default false.
   */
  resolveSubpaths?: boolean;
  signal?: AbortSignal;
}

/**
 * Resolves every specifier a snippet needs *before* evaluation, because
 * Sucrase emits synchronous `require()` calls that cannot await anything.
 */
export async function resolveModules(options: ResolveOptions): Promise<ResolvedModules> {
  const { registry, specifiers, resolveSubpaths = false, signal } = options;
  const resolved = new Map<string, NormalizedModule>();

  const pending: Array<Promise<void>> = [];

  for (const specifier of specifiers) {
    if (resolved.has(specifier)) continue;

    const found = lookup(registry, specifier, resolveSubpaths);
    if (found === MISSING) {
      // Side-effect asset imports are a no-op rather than an error, so a
      // snippet copied out of a real file with `import './styles.css'` runs.
      if (ASSET_RE.test(specifier)) resolved.set(specifier, defineModule({}));
      // Anything else stays unresolved. We deliberately do not throw here:
      // the specifier scan is deliberately over-inclusive, so only an actual
      // require() at runtime is proof the snippet really needs it.
      continue;
    }

    if (isLoader(found)) {
      pending.push(
        Promise.resolve(found(specifier)).then((value) => {
          resolved.set(specifier, normalizeModule(value));
        }),
      );
    } else {
      resolved.set(specifier, normalizeModule(found));
    }
  }

  if (pending.length > 0) await Promise.all(pending);
  signal?.throwIfAborted();

  const keys = Object.keys(registry);
  return {
    get: (specifier) => resolved.get(specifier),
    keys,
  };
}

/** Sentinel distinguishing "not registered" from a registered `undefined`. */
const MISSING = Symbol('missing');

/** Specifiers resolved to an empty module rather than an error. */
export function isIgnoredSpecifier(specifier: string): boolean {
  return ASSET_RE.test(specifier);
}

/**
 * The registry key that would serve a specifier, or undefined if none would.
 *
 * Key matching only - no values, no loaders, nothing executed. That is what
 * lets a snippet be checked on a server, or in CI, without running it.
 */
export function matchRegistryKey(
  specifier: string,
  keys: readonly string[],
): string | undefined {
  if (keys.includes(specifier)) return specifier;

  let best: string | undefined;
  for (const key of keys) {
    if (!key.endsWith('/') || !specifier.startsWith(key)) continue;
    if (best === undefined || key.length > best.length) best = key;
  }
  return best;
}

function lookup(
  registry: ModuleRegistry,
  specifier: string,
  resolveSubpaths: boolean,
): ModuleValue | ModuleLoader | typeof MISSING {
  if (Object.prototype.hasOwnProperty.call(registry, specifier)) {
    return registry[specifier];
  }

  // Prefix entries: a key ending in '/' claims the whole subtree and receives
  // the full specifier, letting a host route a whole package subtree through
  // one loader.
  let bestPrefix: string | undefined;
  for (const key of Object.keys(registry)) {
    if (!key.endsWith('/')) continue;
    if (!specifier.startsWith(key)) continue;
    if (bestPrefix === undefined || key.length > bestPrefix.length) bestPrefix = key;
  }
  if (bestPrefix !== undefined) {
    // No wrapping needed: the caller invokes the loader with the full
    // specifier, which is exactly what a prefix entry wants.
    return registry[bestPrefix];
  }

  if (resolveSubpaths) {
    const walked = walkSubpath(registry, specifier);
    if (walked !== MISSING) return walked;
  }

  return MISSING;
}

/**
 * `pkg/Sub` against a registered `pkg` namespace, by reading
 * the remaining path segments as properties.
 */
function walkSubpath(
  registry: ModuleRegistry,
  specifier: string,
): ModuleValue | typeof MISSING {
  let base: string | undefined;
  for (const key of Object.keys(registry)) {
    if (!specifier.startsWith(key + '/')) continue;
    if (base === undefined || key.length > base.length) base = key;
  }
  if (base === undefined) return MISSING;

  let current = registry[base];
  if (isLoader(current)) return MISSING; // cannot walk without awaiting

  for (const segment of specifier.slice(base.length + 1).split('/')) {
    if (current === null || current === undefined) return MISSING;
    if (typeof current !== 'object' && typeof current !== 'function') return MISSING;
    const next = (current as Record<string, unknown>)[segment];
    if (next === undefined) return MISSING;
    current = next;
  }
  return current;
}

/**
 * The synchronous `require` shim handed to compiled snippets. Sucrase emits
 * `var _react = require('react')` at module top level, so this must never
 * return a promise.
 */
export function createRequire(
  resolved: ResolvedModules,
): (specifier: string) => NormalizedModule {
  return function require(specifier: string): NormalizedModule {
    const found = resolved.get(specifier);
    if (found === undefined) {
      throw new ModuleNotFoundError(specifier, resolved.keys);
    }
    return found;
  };
}

/**
 * Every `require()` target in compiled output.
 *
 * Deliberately over-inclusive: a match inside a string literal costs one
 * needless registry lookup, whereas a miss would mean a loader never runs and
 * evaluation fails. Unresolvable matches are dropped silently by
 * {@link resolveModules}.
 */
export function scanRequires(code: string): Set<string> {
  const found = new Set<string>();
  const re = /\brequire\s*\(\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    const specifier = match[2];
    if (specifier) found.add(specifier);
  }
  return found;
}
