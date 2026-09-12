import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRegistry, registryFromGlob } from '../src/core/registry';
import {
  createRequire,
  defineLoader,
  defineModule,
  normalizeModule,
  resolveModules,
  scanRequires,
} from '../src/core/resolver';
import { nearestSpecifier } from '../src/core/errors';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('normalizeModule', () => {
  it('always produces an __esModule record, which neutralises Sucrase interop', () => {
    // Both helpers Sucrase emits are identity functions when __esModule is
    // true, which is what makes this function the single source of truth.
    expect(normalizeModule({ a: 1 }).__esModule).toBe(true);
  });

  it('treats a value with its own default as module-shaped', () => {
    expect(normalizeModule({ default: 'x' }).default).toBe('x');
  });

  it('treats a value without a default as the default itself', () => {
    const value = { a: 1 };
    expect(normalizeModule(value).default).toBe(value);
  });

  it('wraps primitives', () => {
    expect(normalizeModule(42).default).toBe(42);
    expect(normalizeModule('s').default).toBe('s');
  });

  it('exposes named exports as live getters rather than copies', () => {
    const source: Record<string, unknown> = { count: 1 };
    const record = normalizeModule(source);
    source.count = 2;
    // A spread would have frozen the old value; a getter tracks the binding.
    expect(record.count).toBe(2);
  });

  it('does not invoke lazy getters while normalising', () => {
    // Large packages use expensive lazy namespace getters; eagerly copying them
    // would instantiate the whole package on every compile.
    const spy = vi.fn(() => 'value');
    const source = Object.defineProperty({}, 'lazy', { get: spy, enumerable: true });

    const record = normalizeModule(source);
    expect(spy).not.toHaveBeenCalled();

    expect(record.lazy).toBe('value');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('passes an already-normalised record straight through', () => {
    const record = defineModule({ default: 1 });
    expect(normalizeModule(record)).toBe(record);
  });

  it('lets defineModule express a named export called default', () => {
    const record = defineModule({ exports: { default: 'dark', light: 'l' } });
    expect(record.default).toBe('dark');
    expect(record.light).toBe('l');
  });
});

describe('scanRequires', () => {
  it('finds require targets in compiled output', () => {
    const found = scanRequires(`var _a = require('alpha'); var _b = require("beta");`);
    expect([...found].sort()).toEqual(['alpha', 'beta']);
  });

  it('is deliberately over-inclusive rather than missing one', () => {
    // A match inside a string costs one wasted lookup; a miss would mean a
    // loader never runs and evaluation fails.
    expect(scanRequires(`const s = "require('in-a-string')";`).has('in-a-string')).toBe(true);
  });
});

describe('resolveModules', () => {
  it('only touches specifiers that were actually imported', async () => {
    const used = vi.fn(() => ({ v: 1 }));
    const unused = vi.fn(() => ({ v: 2 }));

    await resolveModules({
      registry: { used: defineLoader(used), unused: defineLoader(unused) },
      specifiers: ['used'],
    });

    // This is what makes a 300-entry registry free.
    expect(used).toHaveBeenCalledTimes(1);
    expect(unused).not.toHaveBeenCalled();
  });

  it('passes the full specifier to a prefix loader', async () => {
    const load = vi.fn(() => ({}));
    await resolveModules({
      registry: { 'pkg/': defineLoader(load) },
      specifiers: ['pkg/deep/mod'],
    });
    expect(load).toHaveBeenCalledWith('pkg/deep/mod');
  });

  it('prefers the longest matching prefix', async () => {
    const short = vi.fn(() => ({}));
    const long = vi.fn(() => ({}));
    await resolveModules({
      registry: { 'pkg/': defineLoader(short), 'pkg/deep/': defineLoader(long) },
      specifiers: ['pkg/deep/mod'],
    });
    expect(long).toHaveBeenCalled();
    expect(short).not.toHaveBeenCalled();
  });

  it('throws a descriptive error only when the module is really required', () => {
    const require = createRequire({ get: () => undefined, keys: ['@app/store'] });
    expect(() => require('@app/stroe')).toThrow(/is not registered/);
  });
});

describe('createRegistry', () => {
  it('merges groups with later groups winning', () => {
    const merged = createRegistry({ a: 1 }, { b: 2 }, { a: 3 });
    expect(merged).toEqual({ a: 3, b: 2 });
  });

  it('warns when two groups define the same key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createRegistry({ dup: 1 }, { dup: 2 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("'dup'"));
  });

  it('stays quiet when there is no collision', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createRegistry({ a: 1 }, { b: 2 });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('registryFromGlob', () => {
  const glob = {
    './modules/store.ts': () => Promise.resolve({ useStore: () => 1 }),
    './modules/ui.ts': () => Promise.resolve({ Button: () => null }),
  };

  it('maps file paths to specifiers and produces loaders', async () => {
    const registry = registryFromGlob(glob, (p) => {
      const name = p.split('/').pop()?.replace(/\.tsx?$/, '');
      return name ? `@app/${name}` : null;
    });

    expect(Object.keys(registry).sort()).toEqual(['@app/store', '@app/ui']);

    const resolved = await resolveModules({ registry, specifiers: ['@app/store'] });
    expect(typeof resolved.get('@app/store')?.useStore).toBe('function');
  });

  it('omits a file when the mapper returns null', () => {
    const registry = registryFromGlob(glob, (p) => (p.includes('ui') ? null : '@app/store'));
    expect(Object.keys(registry)).toEqual(['@app/store']);
  });

  it('does not load anything at registry-construction time', () => {
    const load = vi.fn(() => Promise.resolve({}));
    registryFromGlob({ './modules/a.ts': load }, () => '@app/a');
    expect(load).not.toHaveBeenCalled();
  });
});

describe('nearestSpecifier', () => {
  it('matches a casing slip exactly', () => {
    expect(nearestSpecifier('@App/Store', ['@app/store'])).toBe('@app/store');
  });

  it('finds a close typo', () => {
    expect(nearestSpecifier('@app/stroe', ['@app/store', 'react'])).toBe('@app/store');
  });

  it('suggests nothing when nothing is close', () => {
    expect(nearestSpecifier('completely-different', ['@app/store'])).toBeUndefined();
  });
});
