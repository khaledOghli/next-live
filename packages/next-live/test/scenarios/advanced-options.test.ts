/**
 * Scenario: the escape hatches.
 *
 * A custom JSX runtime, the classic transform, a swapped-out transpiler, and
 * the resolver primitives are all exported and documented, but a host reaching
 * for them is off the beaten path - which is exactly where a regression would
 * go unnoticed. Each one is pinned here.
 */
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { compile, compileModule } from '../../src/core/compile';
import { setTranspiler } from '../../src/core/transpile';
import { createRequire, normalizeModule, resolveModules } from '../../src/core/resolver';

/**
 * `setTranspiler` mutates module-level state, so every test that touches it
 * puts the real one back - otherwise a later test in this file would silently
 * compile through a stub.
 */
afterEach(() => setTranspiler(null));

function render(result: Awaited<ReturnType<typeof compile>>): string {
  return result.renderable.kind === 'component'
    ? renderToStaticMarkup(React.createElement(result.renderable.component, {}))
    : renderToStaticMarkup(result.renderable.element);
}

describe('scenario: a non-React JSX runtime', () => {
  it('routes JSX through a custom jsxImportSource', async () => {
    const calls: string[] = [];
    const runtime = {
      jsx: (tag: string) => { calls.push(tag); return React.createElement(tag); },
      jsxs: (tag: string) => { calls.push(tag); return React.createElement(tag); },
      Fragment: React.Fragment,
    };

    const result = await compile({
      code: `export default () => <b/>;`,
      jsxImportSource: 'my-jsx',
      // Changing jsxImportSource means you must register <source>/jsx-runtime,
      // because the built-ins only cover React's.
      modules: { 'my-jsx/jsx-runtime': runtime },
    });

    render(result);
    expect(calls).toContain('b');
  });

  it('fails clearly if the custom runtime is not registered', async () => {
    await expect(
      compile({ code: `export default () => <b/>;`, jsxImportSource: 'my-jsx' }),
    ).rejects.toThrow(/my-jsx\/jsx-runtime/);
  });
});

describe('scenario: the classic JSX transform', () => {
  it('compiles through React.createElement instead of the automatic runtime', async () => {
    const result = await compile({
      code: `export default () => <b>classic</b>;`,
      jsxRuntime: 'classic',
    });
    expect(render(result)).toBe('<b>classic</b>');
  });

  it('does not emit a jsx-runtime import in classic mode', async () => {
    const result = await compile({
      code: `export default () => <b/>;`,
      jsxRuntime: 'classic',
    });
    expect(result.imports).not.toContain('react/jsx-runtime');
  });
});

describe('scenario: swapping the transpiler wholesale', () => {
  it('uses the replacement for every compile', async () => {
    setTranspiler({
      transform: () => ({ code: `exports.default = () => React.createElement('i', null, 'stub');` }),
    } as never);

    const result = await compile({ code: 'this source is never parsed' });
    expect(render(result)).toBe('<i>stub</i>');
  });

  it('restores the real transpiler when reset to null', async () => {
    setTranspiler({ transform: () => ({ code: `exports.default = () => null;` }) } as never);
    setTranspiler(null);

    const result = await compile({ code: `export default () => <b>real</b>;` });
    expect(render(result)).toBe('<b>real</b>');
  });
});

describe('scenario: driving the resolver directly', () => {
  it('resolveModules + createRequire behave like the compiler does', async () => {
    const resolved = await resolveModules({
      registry: { lib: { a: 1 }, other: { b: 2 } },
      // Only what was asked for is resolved, so an unused registry entry costs
      // nothing.
      specifiers: ['lib'],
    });

    const require = createRequire(resolved);
    expect(require('lib').a).toBe(1);
  });

  it('throws a descriptive error only when an unresolved module is really required', async () => {
    const require = createRequire(await resolveModules({ registry: {}, specifiers: [] }));
    expect(() => require('missing')).toThrow(/missing/);
  });

  it('normalizeModule always produces an __esModule record', () => {
    for (const value of [{ a: 1 }, () => 'fn', 'primitive', 42]) {
      const normalized = normalizeModule(value);
      expect(normalized.__esModule).toBe(true);
      expect('default' in normalized).toBe(true);
    }
  });
});

describe('scenario: a snippet that exports a plain value', () => {
  it('compileModule returns the default alongside named exports', async () => {
    const result = await compileModule({
      code: `export default 42;\nexport const other = 1;`,
    });
    expect(result.exports.default).toBe(42);
    expect(result.exports.other).toBe(1);
  });

  it('compile rejects it, because a number is not renderable', async () => {
    await expect(compile({ code: `export default 42;` })).rejects.toThrow(/number/i);
  });
});
