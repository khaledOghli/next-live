/**
 * Scenario: whatever an author actually types.
 *
 * Stored snippets come from humans and from copy-paste, so the compiler sees
 * empty strings, comment-only files, CRLF line endings, byte-order marks, and
 * every documented snippet shape. None of these should produce a crash, an
 * unhelpful error, or - worse - silent success that renders nothing.
 */
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { compile, compileModule } from '../../src/core/compile';
import { LiveCompileError, NoComponentError } from '../../src/core/errors';

async function html(code: string, props: Record<string, unknown> = {}): Promise<string> {
  const result = await compile({ code });
  return result.renderable.kind === 'component'
    ? renderToStaticMarkup(React.createElement(result.renderable.component, props))
    : renderToStaticMarkup(result.renderable.element);
}

describe('scenario: every documented snippet shape renders', () => {
  it.each([
    ['export default function', `export default function App() { return <b>ok</b>; }`],
    ['export default arrow', `export default () => <b>ok</b>;`],
    ['bare declaration', `function App() { return <b>ok</b>; }`],
    ['bare JSX expression', `<b>ok</b>`],
    ['bare arrow expression', `() => <b>ok</b>`],
    ['render() call', `const A = () => <b>ok</b>;\nrender(<A/>);`],
    ['module.exports', `module.exports = function App() { return <b>ok</b>; };`],
    ['single named export', `export function App() { return <b>ok</b>; }`],
  ])('%s', async (_label, code) => {
    expect(await html(code)).toBe('<b>ok</b>');
  });

  it('reports which form it used, for debugging', async () => {
    const via = async (code: string) => (await compile({ code })).via;

    expect(await via(`export default () => <b/>;`)).toBe('export default');
    // A bare expression is wrapped in `export default (...)` before it is ever
    // evaluated, so it is indistinguishable from a real default export here.
    expect(await via(`<b/>`)).toBe('export default');
    // A lone declaration is wrapped as `export default (function App(){})`, so
    // it really is a default export. Recovery only kicks in when the wrap is
    // impossible, which needs more than one statement.
    expect(await via(`function App() { return <b/>; }`)).toBe('export default');
    expect(await via(`const App = () => <b/>;\nconst y = 2;`)).toBe('declaration');
    expect(await via(`export function App() { return <b/>; }`)).toBe('named export');
    expect(await via(`const A = () => <b/>;\nrender(<A/>);`)).toBe('render()');
    expect(await via(`module.exports = () => <b/>;`)).toBe('module.exports');
  });
});

describe('scenario: empty or content-free source', () => {
  it.each([
    ['empty string', ''],
    ['whitespace only', '   \n\t  \n'],
    ['line comment only', '// just a note'],
    ['block comment only', '/* nothing here */'],
  ])('%s fails with NoComponentError, not a crash', async (_label, code) => {
    await expect(compile({ code })).rejects.toBeInstanceOf(NoComponentError);
  });

  it('explains what to add rather than reporting an internal failure', async () => {
    await expect(compile({ code: '' })).rejects.toThrow(/export default/i);
  });

  it('is fine for compileModule, which does not require a component', async () => {
    const result = await compileModule({ code: '// nothing' });
    expect(result.exports).toEqual({});
    expect(result.imports).toEqual([]);
  });
});

describe('scenario: copy-pasted source with unusual bytes', () => {
  it('handles CRLF line endings', async () => {
    expect(await html(`export default function App() {\r\n  return <b>ok</b>;\r\n}`)).toBe('<b>ok</b>');
  });

  it('handles a leading byte-order mark', async () => {
    expect(await html(`﻿export default () => <b>ok</b>;`)).toBe('<b>ok</b>');
  });

  it('handles unicode in text and identifiers', async () => {
    expect(await html(`const gruß = 'héllo 🌍';\nexport default () => <b>{gruß}</b>;`)).toBe(
      '<b>héllo 🌍</b>',
    );
  });

  it('preserves emoji and entities in JSX text', async () => {
    expect(await html(`export default () => <b>a &amp; b 🎉</b>;`)).toBe('<b>a &amp; b 🎉</b>');
  });

  it('handles a snippet with no trailing newline', async () => {
    expect(await html(`export default () => <b>ok</b>`)).toBe('<b>ok</b>');
  });
});

describe('scenario: TypeScript syntax is stripped, not checked', () => {
  it('strips interfaces, generics, and annotations', async () => {
    const code = `interface Props { label: string }
type Id = number;
export default function App({ label }: Props) {
  const id: Id = 1;
  const pick = <T,>(v: T): T => v;
  return <b>{pick(label)}{id}</b>;
}`;
    expect(await html(code, { label: 'x' })).toBe('<b>x1</b>');
  });

  it('does not report a type error, because nothing type-checks', async () => {
    // A deliberate type error: it must compile and run regardless.
    const code = `const n: number = 'not a number';\nexport default () => <b>{n}</b>;`;
    expect(await html(code)).toBe('<b>not a number</b>');
  });

  it('supports enums and satisfies', async () => {
    const code = `enum Size { S = 'small' }
export default () => <b>{Size.S satisfies string}</b>;`;
    expect(await html(code)).toBe('<b>small</b>');
  });
});

describe('scenario: syntax errors point at the right place', () => {
  it('throws LiveCompileError with a 1-based line matching the source', async () => {
    const code = `export default function App() {\n  const x = ;\n  return <b/>;\n}`;
    await expect(compile({ code })).rejects.toBeInstanceOf(LiveCompileError);

    const error = await compile({ code }).catch((e: LiveCompileError) => e);
    expect(error.line).toBe(2);
  });

  it('reports line 1 correctly for a bare expression, despite the wrapper', async () => {
    // The wrapper adds lines above the user's line 1; linePrefixOffset has to
    // be subtracted back out or every error in an expression snippet is off.
    const error = await compile({ code: `<div className={>` }).catch((e: LiveCompileError) => e);
    expect(error).toBeInstanceOf(LiveCompileError);
    expect(error.line).toBe(1);
  });
});

describe('scenario: a snippet that throws at runtime', () => {
  it('surfaces the throw rather than swallowing it', async () => {
    await expect(
      compile({ code: `throw new Error('boom');\nexport default () => <b/>;` }),
    ).rejects.toThrow(/boom/);
  });

  it('maps a module-scope throw back to the snippet line', async () => {
    const error = await compile({
      code: `const a = null;\nconst b = a.x;\nexport default () => <b/>;`,
    }).catch((e: Error & { line?: number }) => e);
    expect(error.line).toBe(2);
  });
});

describe('scenario: larger snippets stay correct', () => {
  it('compiles a snippet with many components and deep nesting', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => `<li key={${i}}>{${i}}</li>`).join('\n      ');
    const code = `export default function App() {
  return (
    <ul>
      ${rows}
    </ul>
  );
}`;
    const out = await html(code);
    expect(out.startsWith('<ul>')).toBe(true);
    expect(out).toContain('<li>199</li>');
  });
});
