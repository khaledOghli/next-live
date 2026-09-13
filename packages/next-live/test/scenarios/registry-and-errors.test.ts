/**
 * Scenario: how a host wires its SDK up, and what happens when that goes wrong.
 *
 * The registry is the library's core concept, so the failure modes matter as
 * much as the happy path: a loader that rejects, a specifier nobody registered,
 * a prefix that overlaps an exact key. Each error class also advertises fields
 * the docs tell hosts to read, and those are pinned here.
 */
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { compile, compileModule } from '../../src/core/compile';
import {
  LiveCompileError,
  LiveError as LiveErrorBase,
  LiveRuntimeError,
  ModuleNotFoundError,
  NoComponentError,
  RenderLoopError,
  TranspilerLoadError,
} from '../../src/core/errors';
import { createRegistry, registryFromGlob } from '../../src/core/registry';
import { defineLoader, defineModule } from '../../src/core/resolver';
import type { ModuleRegistry } from '../../src/core/types';

async function html(code: string, modules: ModuleRegistry = {}): Promise<string> {
  const result = await compile({ code, modules });
  return result.renderable.kind === 'component'
    ? renderToStaticMarkup(React.createElement(result.renderable.component, {}))
    : renderToStaticMarkup(result.renderable.element);
}

const Button = ({ children }: { children?: React.ReactNode }) =>
  React.createElement('button', null, children);

describe('scenario: handing snippets an SDK', () => {
  it('resolves a plain object registered by value', async () => {
    expect(await html(`import { Button } from '@app/ui';\nexport default () => <Button>go</Button>;`, {
      '@app/ui': { Button },
    })).toBe('<button>go</button>');
  });

  it('resolves a lazy loader, awaiting it before evaluation', async () => {
    const load = vi.fn(async () => ({ Button }));
    expect(await html(`import { Button } from '@app/ui';\nexport default () => <Button>go</Button>;`, {
      '@app/ui': defineLoader(load),
    })).toBe('<button>go</button>');
    expect(load).toHaveBeenCalledOnce();
  });

  it('never calls a loader the snippet did not import', async () => {
    const unused = vi.fn(async () => ({}));
    await html(`export default () => <b>ok</b>;`, { '@app/unused': defineLoader(unused) });
    expect(unused).not.toHaveBeenCalled();
  });

  it('lets defineModule express an object that is itself the default export', async () => {
    const config = { theme: 'dark' };
    expect(
      await html(`import cfg from '@app/config';\nexport default () => <b>{cfg.theme}</b>;`, {
        '@app/config': defineModule({ default: config }),
      }),
    ).toBe('<b>dark</b>');
  });

  it('merges registry groups, with later groups winning', async () => {
    const registry = createRegistry(
      { '@app/ui': { Button: () => React.createElement('button', null, 'old') } },
      { '@app/ui': { Button } },
    );
    expect(await html(`import { Button } from '@app/ui';\nexport default () => <Button>new</Button>;`, registry))
      .toBe('<button>new</button>');
  });
});

describe('scenario: prefix entries serve a whole namespace', () => {
  const registry: ModuleRegistry = {
    'big-lib/': defineLoader((specifier) => ({
      default: () => React.createElement('i', null, specifier),
    })),
  };

  it('serves any subpath beneath the prefix', async () => {
    expect(await html(`import X from 'big-lib/deep/thing';\nexport default () => <X/>;`, registry))
      .toBe('<i>big-lib/deep/thing</i>');
  });

  it('prefers an exact key over a prefix that also matches', async () => {
    expect(
      await html(`import X from 'big-lib/special';\nexport default () => <X/>;`, {
        ...registry,
        'big-lib/special': { default: () => React.createElement('em', null, 'exact') },
      }),
    ).toBe('<em>exact</em>');
  });

  it('prefers the longest matching prefix', async () => {
    expect(
      await html(`import X from 'big-lib/deep/thing';\nexport default () => <X/>;`, {
        ...registry,
        'big-lib/deep/': defineLoader(() => ({ default: () => React.createElement('u', null, 'deeper') })),
      }),
    ).toBe('<u>deeper</u>');
  });
});

describe('scenario: an import nobody registered', () => {
  it('throws ModuleNotFoundError naming the specifier', async () => {
    const error = await compile({
      code: `import _ from 'lodash';\nexport default () => <b>{_.noop}</b>;`,
    }).catch((e: ModuleNotFoundError) => e);

    expect(error).toBeInstanceOf(ModuleNotFoundError);
    expect(error.specifier).toBe('lodash');
    expect(error.message).toContain('lodash');
  });

  it('lists what was available, so the author can self-serve', async () => {
    const error = await compile({
      code: `import x from '@app/nope';\nexport default () => <b>{x}</b>;`,
      modules: { '@app/ui': {}, '@app/store': {} },
    }).catch((e: ModuleNotFoundError) => e);

    expect(error.available).toEqual(expect.arrayContaining(['@app/ui', '@app/store']));
  });

  it('suggests the nearest match for a typo', async () => {
    const error = await compile({
      code: `import x from '@app/stor';\nexport default () => <b>{x}</b>;`,
      modules: { '@app/store': {} },
    }).catch((e: ModuleNotFoundError) => e);

    expect(error.message).toMatch(/@app\/store/);
  });

  it('does not fire for an import whose binding is never used', async () => {
    // Sucrase elides it as a presumed type import, so it is never required -
    // and the same elision happens in the browser, so nothing is fetched.
    await expect(
      html(`import _ from 'lodash';\nexport default () => <b>ok</b>;`),
    ).resolves.toBe('<b>ok</b>');
  });

  it('reports react-dom as unregistered, since it is deliberately not built in', async () => {
    const error = await compile({
      code: `import rd from 'react-dom';\nexport default () => <b>{rd.version}</b>;`,
    }).catch((e: ModuleNotFoundError) => e);
    expect(error).toBeInstanceOf(ModuleNotFoundError);
    expect(error.specifier).toBe('react-dom');
  });
});

describe('scenario: a loader that fails', () => {
  it('surfaces a rejected loader rather than hanging', async () => {
    await expect(
      compile({
        code: `import x from '@app/broken';\nexport default () => <b>{x}</b>;`,
        modules: { '@app/broken': defineLoader(async () => { throw new Error('chunk load failed'); }) },
      }),
    ).rejects.toThrow(/chunk load failed/);
  });

  it('surfaces a loader that throws synchronously', async () => {
    await expect(
      compile({
        code: `import x from '@app/broken';\nexport default () => <b>{x}</b>;`,
        modules: { '@app/broken': defineLoader(() => { throw new Error('boom'); }) },
      }),
    ).rejects.toThrow(/boom/);
  });
});

describe('scenario: registryFromGlob for a directory of modules', () => {
  it('builds loaders and maps paths to the specifiers authors write', async () => {
    const registry = registryFromGlob(
      { './modules/ui.ts': async () => ({ Button }) },
      (path) => `@app/${path.replace('./modules/', '').replace('.ts', '')}`,
    );

    expect(Object.keys(registry)).toEqual(['@app/ui']);
    expect(await html(`import { Button } from '@app/ui';\nexport default () => <Button>g</Button>;`, registry))
      .toBe('<button>g</button>');
  });

  it('omits a file when the mapper returns null', () => {
    const registry = registryFromGlob(
      { './modules/ui.ts': async () => ({}), './modules/secret.ts': async () => ({}) },
      (path) => (path.includes('secret') ? null : '@app/ui'),
    );
    expect(Object.keys(registry)).toEqual(['@app/ui']);
  });
});

describe('scenario: subpath walking is opt-in', () => {
  const modules = { 'kit': { Button, Card: () => React.createElement('div') } };

  it('fails by default, rather than silently guessing', async () => {
    await expect(
      compile({ code: `import { Button } from 'kit/Button';\nexport default () => <Button/>;`, modules }),
    ).rejects.toBeInstanceOf(ModuleNotFoundError);
  });

  it('walks the subtree when resolveSubpaths is enabled', async () => {
    expect(
      await (async () => {
        const r = await compile({
          code: `import Button from 'kit/Button';\nexport default () => <Button>x</Button>;`,
          modules,
          resolveSubpaths: true,
        });
        return renderToStaticMarkup(
          React.createElement(
            (r.renderable as { component: React.ComponentType }).component,
          ),
        );
      })(),
    ).toBe('<button>x</button>');
  });
});

describe('scenario: the error contract a host can rely on', () => {
  it('LiveCompileError carries a 1-based line and a column', async () => {
    const error = await compile({
      code: `export default function A() {\n  const x = ;\n}`,
    }).catch((e: LiveCompileError) => e);

    expect(error).toBeInstanceOf(LiveCompileError);
    expect(error.line).toBe(2);
    expect(typeof error.column).toBe('number');
  });

  it('LiveRuntimeError carries the line a module-scope throw came from', async () => {
    const error = await compile({
      code: `const o = null;\nconst v = o.x;\nexport default () => <b/>;`,
    }).catch((e: LiveRuntimeError) => e);

    expect(error).toBeInstanceOf(LiveRuntimeError);
    expect(error.line).toBe(2);
  });

  it('NoComponentError explains what was exported instead', async () => {
    const error = await compile({
      code: `export const helper = 1;\nexport const other = 2;`,
    }).catch((e: NoComponentError) => e);

    expect(error).toBeInstanceOf(NoComponentError);
    expect(error.message).toMatch(/helper/);
  });

  it('every error class is distinguishable by instanceof', () => {
    for (const Ctor of [
      LiveCompileError,
      LiveRuntimeError,
      ModuleNotFoundError,
      NoComponentError,
      RenderLoopError,
    ]) {
      expect(typeof Ctor).toBe('function');
      expect(Ctor.prototype).toBeInstanceOf(Error);
    }
  });

  it('every error class exposes a stable code', async () => {
    const compileErr = await compile({
      code: `export default function A() {\n  const x = ;\n}`,
    }).catch((e: LiveCompileError) => e);
    expect(compileErr.code).toBe('COMPILE');

    const runtimeErr = await compile({
      code: `throw new Error('x');\nexport default () => <b/>;`,
    }).catch((e: LiveRuntimeError) => e);
    expect(runtimeErr.code).toBe('RUNTIME');

    const modErr = await compile({
      code: `import x from '@app/nope';\nexport default () => <b>{x}</b>;`,
    }).catch((e: ModuleNotFoundError) => e);
    expect(modErr.code).toBe('MODULE_NOT_FOUND');

    const noCompErr = await compile({
      code: `export const helper = 1;`,
    }).catch((e: NoComponentError) => e);
    expect(noCompErr.code).toBe('NO_COMPONENT');

    expect(new TranspilerLoadError(new Error('load')).code).toBe('TRANSPILER_LOAD');
    expect(new RenderLoopError('loop').code).toBe('RENDER_LOOP');
  });

  it('RenderLoopError instanceof LiveRuntimeError and LiveError', () => {
    const err = new RenderLoopError('loop');
    expect(err).toBeInstanceOf(RenderLoopError);
    expect(err).toBeInstanceOf(LiveRuntimeError);
    expect(err).toBeInstanceOf(LiveErrorBase);
  });

  it('LiveErrorBase keeps 0.1.0-style constructor options', () => {
    const cause = new Error('inner');
    const err = new LiveErrorBase('x', { cause });
    expect(err.cause).toBe(cause);
    expect(err.code).toBe('RUNTIME');
  });

  it('code literal narrows LiveCompileError fields', async () => {
    const err = await compile({
      code: `export default function A() {\n  const x = ;\n}`,
    }).catch((e: unknown) => e);

    if (err instanceof LiveCompileError && err.code === 'COMPILE') {
      expect(typeof err.line).toBe('number');
    } else {
      throw new Error('expected LiveCompileError');
    }
  });
});

describe('scenario: non-UI snippets', () => {
  it('returns every export, with no component required', async () => {
    const result = await compileModule({
      code: `export const rate = 0.2;
export function apply(n) { return n * (1 - rate); }
export default { name: 'discount' };`,
    });

    expect(result.exports.rate).toBe(0.2);
    expect((result.exports.apply as (n: number) => number)(100)).toBe(80);
    expect(result.exports.default).toEqual({ name: 'discount' });
  });

  it('gives the imports a host might want to audit', async () => {
    const result = await compileModule({
      code: `import { fmt } from '@app/format';\nexport const run = () => fmt(1);`,
      modules: { '@app/format': { fmt: (n: number) => String(n) } },
    });
    expect(result.imports).toContain('@app/format');
  });
});
