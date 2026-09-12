/**
 * Scenario: a host precompiles snippets on the server and ships ready
 * JavaScript to the browser.
 *
 * The contract the docs make is strong - "a precompiled result and a
 * client-compiled one are interchangeable" - and nothing was pinning it. These
 * cases exercise the whole documented workflow: precompile, cache by hash,
 * hand back through `precompiledTransform`, evaluate, and get the same DOM.
 */
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { precompile } from '../../src/server';
import { compile, compileModule } from '../../src/core/compile';
import { precompiledTransform, transpile } from '../../src/core/transpile';
import { LiveCompileError } from '../../src/core/errors';

const COMPONENT = `import { useState } from 'react';

export default function App({ label }) {
  const [n] = useState(3);
  return <b>{label}:{n}</b>;
}
`;

const EXPRESSION = `<i>bare</i>`;

/** Renders whatever a compile produced, so both paths can be compared as DOM. */
function html(result: Awaited<ReturnType<typeof compile>>, props: Record<string, unknown> = {}) {
  return result.renderable.kind === 'component'
    ? renderToStaticMarkup(React.createElement(result.renderable.component, props))
    : renderToStaticMarkup(result.renderable.element);
}

describe('scenario: precompile on the server, run in the browser', () => {
  it('produces a result the client path accepts unchanged', async () => {
    const compiled = precompile(COMPONENT);

    // The "browser": never loads Sucrase, just replays the server's output.
    const viaServer = await compile({
      code: COMPONENT,
      transform: precompiledTransform(compiled),
    });
    const viaClient = await compile({ code: COMPONENT });

    expect(html(viaServer, { label: 'x' })).toBe('<b>x:3</b>');
    expect(html(viaServer, { label: 'x' })).toBe(html(viaClient, { label: 'x' }));
  });

  it('emits byte-identical code to the client transpiler', async () => {
    const server = precompile(COMPONENT);
    const client = await transpile(COMPONENT, {
      filePath: 'LiveCode.tsx',
      production: true,
      jsxRuntime: 'automatic',
      jsxImportSource: 'react',
    });

    expect(server.code).toBe(client.code);
    expect(server.linePrefixOffset).toBe(client.linePrefixOffset);
    expect(server.expression).toBe(client.expression);
  });

  it('wraps a bare expression exactly as the client wraps it', async () => {
    const server = precompile(EXPRESSION);
    expect(server.expression).toBe(true);

    const viaServer = await compile({
      code: EXPRESSION,
      transform: precompiledTransform(server),
    });
    expect(html(viaServer)).toBe('<i>bare</i>');
  });

  it('still reports the snippet imports, so a host can preload them', async () => {
    const compiled = precompile(`import { Button } from '@app/ui';
export default () => <Button/>;`);

    const result = await compile({
      code: 'ignored, the transform supplies the code',
      transform: precompiledTransform(compiled),
      modules: { '@app/ui': { Button: () => React.createElement('button') } },
    });

    expect(result.imports).toContain('@app/ui');
  });

  it('works with compileModule for non-UI snippets', async () => {
    const source = `export const rate = 0.2;\nexport default (n) => n * rate;`;
    const compiled = precompile(source);

    const result = await compileModule({
      code: source,
      transform: precompiledTransform(compiled),
    });

    expect(result.exports.rate).toBe(0.2);
    expect((result.exports.default as (n: number) => number)(50)).toBe(10);
  });
});

describe('scenario: caching precompiled output by hash', () => {
  it('is deterministic for the same source and options', () => {
    expect(precompile(COMPONENT).hash).toBe(precompile(COMPONENT).hash);
  });

  it('changes when the source changes, even by one character', () => {
    const a = precompile(`export default () => <b>1</b>;`).hash;
    const b = precompile(`export default () => <b>2</b>;`).hash;
    expect(a).not.toBe(b);
  });

  it.each([
    ['production', { production: false }],
    ['jsxRuntime', { jsxRuntime: 'classic' as const }],
    ['jsxImportSource', { jsxImportSource: 'preact' }],
  ])('changes when %s changes, so a cache cannot serve the wrong build', (_label, options) => {
    expect(precompile(COMPONENT, options).hash).not.toBe(precompile(COMPONENT).hash);
  });

  it('ignores filePath, which does not affect the emitted code', () => {
    // filePath drives the sourceURL appended at evaluation time, not the
    // transpiled output - so keying a cache on it would fragment it for nothing.
    expect(precompile(COMPONENT, { filePath: 'a.tsx' }).hash).toBe(
      precompile(COMPONENT, { filePath: 'b.tsx' }).hash,
    );
  });

  it('is a short, URL-safe string usable as an ETag', () => {
    expect(precompile(COMPONENT).hash).toMatch(/^[a-z0-9]+$/);
  });
});

describe('scenario: a stored snippet fails to precompile', () => {
  it('throws LiveCompileError rather than a raw Sucrase error', () => {
    expect(() => precompile(`export default () => <div>`)).toThrow(LiveCompileError);
  });

  it('carries the line and column so a control panel can point at it', () => {
    let caught: LiveCompileError | undefined;
    try {
      precompile(`export default function A() {\n  return <div;\n}`);
    } catch (error) {
      caught = error as LiveCompileError;
    }

    expect(caught).toBeInstanceOf(LiveCompileError);
    expect(caught?.line).toBeGreaterThan(0);
    expect(caught?.message).not.toMatch(/\(\d+:\d+\)\s*$/);
  });
});

describe('scenario: production vs development JSX runtime', () => {
  it('selects jsx-dev-runtime when production is false', () => {
    expect(precompile(COMPONENT, { production: false }).code).toContain('react/jsx-dev-runtime');
  });

  it('selects jsx-runtime by default', () => {
    const { code } = precompile(COMPONENT);
    expect(code).toContain('react/jsx-runtime');
    expect(code).not.toContain('jsx-dev-runtime');
  });
});
