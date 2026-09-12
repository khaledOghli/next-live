import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { compile, compileModule } from '../src/core/compile';
import type { CompileInput } from '../src/core/compile';
import { ModuleNotFoundError, NoComponentError } from '../src/core/errors';
import { defineLoader } from '../src/core/resolver';

/** Compiles a snippet and renders whatever it produced to static HTML. */
async function render(
  code: string,
  options: Omit<CompileInput, 'code'> & { props?: Record<string, unknown> } = {},
): Promise<string> {
  const { props = {}, ...rest } = options;
  const result = await compile({ code, ...rest });
  return result.renderable.kind === 'component'
    ? renderToStaticMarkup(React.createElement(result.renderable.component, props))
    : renderToStaticMarkup(result.renderable.element);
}

/**
 * The interop matrix.
 *
 * Sucrase's `imports` transform emits its own `_interopRequireDefault` /
 * `_interopRequireWildcard` helpers, and every one of these forms goes through
 * a different path in `normalizeModule`. This is the part of the library most
 * likely to be subtly wrong, so each form gets its own case.
 */
describe('module resolution', () => {
  const namespace = { version: '1.0', helper: () => 'helped' };

  it('resolves a default import to the module itself when it has no default', async () => {
    const html = await render(
      `import lib from 'lib';\nexport default () => <b>{lib.version}</b>;`,
      { modules: { lib: namespace } },
    );
    expect(html).toBe('<b>1.0</b>');
  });

  it('unwraps a module-shaped value for a default import', async () => {
    const html = await render(
      `import value from 'lib';\nexport default () => <b>{value}</b>;`,
      { modules: { lib: { default: 'unwrapped' } } },
    );
    expect(html).toBe('<b>unwrapped</b>');
  });

  it('resolves named imports', async () => {
    const html = await render(
      `import { helper } from 'lib';\nexport default () => <b>{helper()}</b>;`,
      { modules: { lib: namespace } },
    );
    expect(html).toBe('<b>helped</b>');
  });

  it('resolves renamed named imports', async () => {
    const html = await render(
      `import { helper as h } from 'lib';\nexport default () => <b>{h()}</b>;`,
      { modules: { lib: namespace } },
    );
    expect(html).toBe('<b>helped</b>');
  });

  it('resolves namespace imports', async () => {
    const html = await render(
      `import * as lib from 'lib';\nexport default () => <b>{lib.version}</b>;`,
      { modules: { lib: namespace } },
    );
    expect(html).toBe('<b>1.0</b>');
  });

  it('gives snippets the host React instance without registering it', async () => {
    const html = await render(
      `import React from 'react';\nexport default () => <b>{typeof React.useState}</b>;`,
    );
    expect(html).toBe('<b>function</b>');
  });

  it('supports hooks, which requires the shared React instance', async () => {
    const html = await render(
      `import { useState } from 'react';\nexport default () => { const [n] = useState(7); return <b>{n}</b>; };`,
    );
    expect(html).toBe('<b>7</b>');
  });

  it('awaits async loaders before evaluating', async () => {
    const html = await render(
      `import { value } from 'lazy';\nexport default () => <b>{value}</b>;`,
      { modules: { lazy: defineLoader(() => Promise.resolve({ value: 'loaded' })) } },
    );
    expect(html).toBe('<b>loaded</b>');
  });

  it('treats an unbranded function as a value, not a loader', async () => {
    // Without the defineLoader brand a function is the module itself —
    // otherwise a registered component could not be told apart from a loader.
    const html = await render(
      `import Fn from 'lib';\nexport default () => <b>{typeof Fn}</b>;`,
      { modules: { lib: () => 'never called' } },
    );
    expect(html).toBe('<b>function</b>');
  });

  it('routes a whole subtree through one prefix entry', async () => {
    const html = await render(
      `import a from 'pkg/deep/one';\nimport b from 'pkg/two';\nexport default () => <b>{a}{b}</b>;`,
      { modules: { 'pkg/': defineLoader((specifier) => ({ default: specifier.slice(4) })) } },
    );
    expect(html).toBe('<b>deep/onetwo</b>');
  });

  it('walks subpaths only when resolveSubpaths is enabled', async () => {
    const code = `import P from 'pkg/geometry/Point';\nexport default () => <b>{P}</b>;`;
    const modules = { pkg: { geometry: { Point: 'point!' } } };

    expect(await render(code, { modules, resolveSubpaths: true })).toBe('<b>point!</b>');
    await expect(compile({ code, modules })).rejects.toThrow(ModuleNotFoundError);
  });

  it('treats asset imports as a no-op', async () => {
    const html = await render(`import './styles.css';\nexport default () => <b>ok</b>;`);
    expect(html).toBe('<b>ok</b>');
  });

  it('names the specifier and suggests a near match when a module is missing', async () => {
    const promise = compile({
      code: `import x from '@app/stroe';\nexport default () => <b>{x}</b>;`,
      modules: { '@app/store': {} },
    });
    await expect(promise).rejects.toThrow(ModuleNotFoundError);
    await expect(promise).rejects.toThrow(/Did you mean '@app\/store'\?/);
  });

  it('ignores an unused import, matching TypeScript semantics', async () => {
    // The TS transform elides it before resolution, so a typo in an unused
    // import is not an error — it simply disappears.
    const html = await render(
      `import unused from 'not-registered';\nexport default () => <b>fine</b>;`,
    );
    expect(html).toBe('<b>fine</b>');
  });
});

describe('authoring styles', () => {
  it('accepts a default-exported function', async () => {
    expect(await render(`export default function App() { return <b>a</b>; }`)).toBe('<b>a</b>');
  });

  it('accepts a bare JSX expression', async () => {
    expect(await render(`<b>bare</b>`)).toBe('<b>bare</b>');
  });

  it('accepts a bare arrow expression', async () => {
    expect(await render(`() => <b>arrow</b>`)).toBe('<b>arrow</b>');
  });

  it('recovers a declared component that was never exported', async () => {
    expect(await render(`function App() { return <b>bare decl</b>; }`)).toBe('<b>bare decl</b>');
  });

  it('supports the render() inline style', async () => {
    const result = await compile({ code: `const X = () => <b>r</b>;\nrender(<X/>);` });
    expect(result.via).toBe('render()');
  });

  it('accepts a single named export when there is no default', async () => {
    expect(await render(`export function App() { return <b>named</b>; }`)).toBe('<b>named</b>');
  });

  it('accepts a memo-wrapped default export', async () => {
    const html = await render(
      `import { memo } from 'react';\nexport default memo(function M() { return <b>memo</b>; });`,
    );
    expect(html).toBe('<b>memo</b>');
  });

  it('accepts a forwardRef default export', async () => {
    const html = await render(
      `import { forwardRef } from 'react';\nexport default forwardRef(function F(_p, _r) { return <b>fwd</b>; });`,
    );
    expect(html).toBe('<b>fwd</b>');
  });

  it('strips TypeScript without checking it', async () => {
    const html = await render(
      `interface Props { n: number }\n` +
        `const A = (p: Props): React.ReactElement => <b>{p.n as number}</b>;\n` +
        `export default A;`,
      { props: { n: 5 } },
    );
    expect(html).toBe('<b>5</b>');
  });
});

describe('scope and props', () => {
  it('injects scope values as free variables', async () => {
    const html = await render(`export default () => <b>{greet('x')}</b>;`, {
      scope: { greet: (s: string) => `hi ${s}` },
    });
    expect(html).toBe('<b>hi x</b>');
  });

  it('passes props by reference, so a snippet can mutate host state', async () => {
    const state = { count: 0 };
    const result = await compile({
      code: `export default ({ state }) => { state.count = 42; return <b>{state.count}</b>; };`,
    });
    if (result.renderable.kind !== 'component') throw new Error('expected a component');
    renderToStaticMarkup(React.createElement(result.renderable.component, { state }));
    expect(state.count).toBe(42);
  });

  it('skips reserved and invalid scope keys rather than failing the compile', async () => {
    const html = await render(`export default () => <b>ok</b>;`, {
      scope: { React: 'shadowed', 'not-an-identifier': 1, valid: 2 },
    });
    expect(html).toBe('<b>ok</b>');
  });
});

describe('imports', () => {
  it('returns sorted imports from compile()', async () => {
    const result = await compile({
      code: `import { useState } from 'react';\nimport { rate } from '@app/config';\nexport default function App() { const [n] = useState(rate); return n; }`,
      modules: { '@app/config': { rate: 1 } },
    });
    expect(result.imports).toEqual(['@app/config', 'react']);
  });

  it('returns sorted imports from compileModule()', async () => {
    const { imports } = await compileModule({
      code: `import { z } from 'z-lib';\nimport { a } from 'a-lib';\nexport const x = z + a;`,
      modules: { 'z-lib': { z: 1 }, 'a-lib': { a: 2 } },
    });
    expect(imports).toEqual(['a-lib', 'z-lib']);
  });
});

describe('errors', () => {
  it('reports a syntax error with a position', async () => {
    await expect(compile({ code: `export default () => <div>` })).rejects.toMatchObject({
      name: 'LiveCompileError',
    });
  });

  it('maps a runtime throw back to the snippet line', async () => {
    const code = `import { useState } from 'react';\nconst a = 1;\n\nthrow new Error('boom');`;
    await expect(compile({ code })).rejects.toMatchObject({ line: 4 });
  });

  it('explains when nothing renderable was produced', async () => {
    await expect(compile({ code: `export const x = 1;` })).rejects.toThrow(NoComponentError);
  });

  it('rejects a default export React cannot render', async () => {
    await expect(compile({ code: `export default "nope";` })).rejects.toThrow(
      /default export is a string/,
    );
  });
});
