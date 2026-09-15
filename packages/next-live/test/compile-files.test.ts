import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transform as sucraseTransform } from 'sucrase';
import { describe, expect, it } from 'vitest';
import { compile, compileModule } from '../src/core/compile';
import type { CompileFilesInput } from '../src/core/compile';
import { ModuleNotFoundError } from '../src/core/errors';
import { defaultTranspileOptions, precompiledTransform, runTranspile } from '../src/core/transpile';
import type { ConsoleEntry, TransformResult } from '../src/core/types';

async function renderProject(input: CompileFilesInput): Promise<string> {
  const result = await compile(input);
  return result.renderable.kind === 'component'
    ? renderToStaticMarkup(React.createElement(result.renderable.component))
    : renderToStaticMarkup(result.renderable.element);
}

const BUTTON = `export function Button({ label }: { label: string }) {
  return <button>{label}</button>;
}`;

describe('multi-file compile', () => {
  it('renders an entry that imports a sibling', async () => {
    const html = await renderProject({
      files: {
        'App.tsx': `import { Button } from './Button';\nexport default () => <Button label="Go" />;`,
        'Button.tsx': BUTTON,
      },
    });
    expect(html).toBe('<button>Go</button>');
  });

  it('uses the first key as the entry unless one is named', async () => {
    const files = {
      'Button.tsx': `export default () => <i>button</i>;`,
      'App.tsx': `export default () => <b>app</b>;`,
    };
    expect(await renderProject({ files })).toBe('<i>button</i>');
    expect(await renderProject({ files, entry: './App.tsx' })).toBe('<b>app</b>');
  });

  it('resolves extensions, index files, parent directories and the root', async () => {
    const html = await renderProject({
      files: {
        'App.tsx': `import { Card } from './components';\nexport default () => <Card />;`,
        'components/index.ts': `export { Card } from './Card';`,
        'components/Card.tsx': `import { upper } from '../lib/text';\nimport { tag } from '/lib/tag';\nexport const Card = () => <p>{upper(tag)}</p>;`,
        'lib/text.ts': `export const upper = (s: string) => s.toUpperCase();`,
        'lib/tag.ts': `export const tag = 'card';`,
      },
    });
    expect(html).toBe('<p>CARD</p>');
  });

  it('reports only registry imports, and the files that ran in order', async () => {
    const result = await compile({
      files: {
        'App.tsx': `import { Button } from './Button';\nexport default () => <Button label="x" />;`,
        'Button.tsx': BUTTON,
        'Unused.tsx': `export const nothing = 1;`,
      },
    });
    expect(result.imports).not.toContain('./Button');
    expect(result.imports).toContain('react/jsx-runtime');
    expect(result.entry).toBe('App.tsx');
    expect(result.files).toEqual(['App.tsx', 'Button.tsx']);
  });

  it('runs a file imported twice only once', async () => {
    const counter = { runs: 0 };
    const { exports } = await compileModule({
      files: {
        'main.ts': `import { a } from './a';\nimport { b } from './b';\nexport default a + b + counter.runs;`,
        'a.ts': `import { value } from './shared';\nexport const a = value;`,
        'b.ts': `import { value } from './shared';\nexport const b = value;`,
        'shared.ts': `counter.runs++;\nexport const value = 10;`,
      },
      scope: { counter },
    });
    expect(counter.runs).toBe(1);
    expect(exports['default']).toBe(21);
  });

  it('supports circular imports the way CommonJS does', async () => {
    const { exports } = await compileModule({
      files: {
        'main.ts': `import { isEven } from './even';\nexport default isEven(4);`,
        'even.ts': `import { isOdd } from './odd';\nexport function isEven(n: number): boolean { return n === 0 || isOdd(n - 1); }`,
        'odd.ts': `import { isEven } from './even';\nexport function isOdd(n: number): boolean { return n !== 0 && isEven(n - 1); }`,
      },
    });
    expect(exports['default']).toBe(true);
  });

  it('never compiles files nothing imports', async () => {
    const html = await renderProject({
      files: { 'App.tsx': `export default () => <b>fine</b>;`, 'Scratch.tsx': `export default function (` },
    });
    expect(html).toBe('<b>fine</b>');
  });

  it('names the file a syntax error is in', async () => {
    await expect(
      compile({
        files: { 'App.tsx': `import './Broken';\nexport default () => null;`, 'Broken.tsx': `\nexport const x = (;` },
      }),
    ).rejects.toMatchObject({ code: 'COMPILE', file: 'Broken.tsx', line: 2 });
  });

  it('does not wrap a non-entry file as a bare expression, or recover its declarations', async () => {
    const { exports } = await compileModule({
      files: {
        'main.ts': `import Card from './Card';\nexport default typeof Card;`,
        'Card.tsx': `function Card() { return <i />; }`,
      },
    });
    // A recovered default would be the function; a private declaration stays private.
    expect(exports['default']).toBe('object');
  });

  it('prefers a project file over a registry key, and falls back to the registry', async () => {
    const { exports } = await compileModule({
      files: {
        'main.ts': `import theme from './theme';\nimport tokens from './tokens';\nexport default [theme, tokens];`,
        'theme.ts': `export default 'from-file';`,
      },
      modules: { './theme': { default: 'from-registry' }, './tokens': { default: 'registry-tokens' } },
    });
    expect(exports['default']).toEqual(['from-file', 'registry-tokens']);
  });

  it('explains a missing import with the importer and a relative suggestion', async () => {
    const failure = compile({
      files: {
        'App.tsx': `import { Button } from './Buton';\nexport default () => <Button label="x" />;`,
        'Button.tsx': BUTTON,
      },
    });
    await expect(failure).rejects.toBeInstanceOf(ModuleNotFoundError);
    await expect(failure).rejects.toMatchObject({ importer: 'App.tsx', file: 'App.tsx', specifier: './Buton' });
    await expect(failure).rejects.toThrow("Did you mean './Button'?");
  });

  it('maps a runtime error to the file and line that threw', async () => {
    await expect(
      compile({
        files: {
          'App.tsx': `import { value } from './components/data';\nexport default () => <b>{value}</b>;`,
          'components/data.ts': `const config: any = null;\n\nexport const value = config.missing;`,
        },
      }),
    ).rejects.toMatchObject({ code: 'RUNTIME', file: 'components/data.ts', line: 3 });
  });

  it('maps lines with the render budget on, as the provider always runs it', async () => {
    await expect(
      compile({
        files: {
          'App.tsx': `import { Card } from './Card';\nexport default function App() { return <Card />; }`,
          'Card.tsx': `export function Card() { return null; }\nconst broken: any = undefined;\nbroken.call();`,
        },
        onRender() {},
      }),
    ).rejects.toMatchObject({ file: 'Card.tsx', line: 3 });
  });

  it('reports the host key, not the normalized path', async () => {
    await expect(
      compile({ files: { './App.tsx': `import './lib';\nexport default () => null;`, './lib.ts': `throw new Error('boom');` } }),
    ).rejects.toMatchObject({ file: './lib.ts', line: 1 });
  });

  it('allows render() only in the entry file', async () => {
    await expect(
      compile({
        files: { 'App.tsx': `import './side';\nexport default () => null;`, 'side.tsx': `render(<b />);` },
      }),
    ).rejects.toThrow("render() can only be called from the entry file ('App.tsx').");
  });

  it('labels console output with the file and line that logged', async () => {
    const entries: ConsoleEntry[] = [];
    await compileModule({
      files: {
        'main.ts': `import './log';\nexport default 1;`,
        'log.ts': `\nconsole.info('from log');`,
      },
      onConsole: (entry) => entries.push(entry),
      forwardConsole: false,
    });
    expect(entries).toEqual([expect.objectContaining({ file: 'log.ts', line: 2, args: ['from log'] })]);
  });

  it('gives a custom transform each file under its own key', async () => {
    const seen: string[] = [];
    await compile({
      files: { 'App.tsx': `import './util';\nexport default () => null;`, 'util.ts': `export const x = 1;` },
      transform: (source, options) => {
        seen.push(options.filePath);
        return runTranspile(sucraseTransform, source, options);
      },
    });
    expect(seen.sort()).toEqual(['App.tsx', 'util.ts']);
  });

  it('runs a precompiled record without the transpiler', async () => {
    const files = {
      'App.tsx': `import { Button } from './Button';\nexport default () => <Button label="pre" />;`,
      'Button.tsx': BUTTON,
    };
    const record: Record<string, TransformResult> = {
      'App.tsx': runTranspile(sucraseTransform, files['App.tsx'], { ...defaultTranspileOptions, filePath: 'App.tsx' }),
      'Button.tsx': runTranspile(sucraseTransform, BUTTON, { ...defaultTranspileOptions, filePath: 'Button.tsx' }, 'module'),
    };
    expect(await renderProject({ files, transform: precompiledTransform(record) })).toBe('<button>pre</button>');

    await expect(
      compile({ files, transform: precompiledTransform({ 'App.tsx': record['App.tsx'] as TransformResult }) }),
    ).rejects.toMatchObject({ code: 'COMPILE', file: 'Button.tsx' });
  });

  it('stops when aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      compile({ files: { 'App.tsx': `export default () => null;` }, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects an unknown entry', async () => {
    await expect(compile({ files: { 'App.tsx': '' }, entry: 'Main.tsx' })).rejects.toMatchObject({ code: 'COMPILE' });
  });
});

/**
 * A one-file project must behave exactly like the same source passed as
 * `code`, so moving a snippet into `files` never changes what it does.
 */
describe('parity between code and a one-file project', () => {
  const fixtures: Array<[string, string]> = [
    ['export default function', `export default function App() { return <b>hi</b>; }`],
    ['bare expression', `<b>bare</b>`],
    ['recovered declaration', `function Widget() { return <i>widget</i>; }`],
    ['render() call', `render(<u>rendered</u>);`],
    ['named export', `export const Only = () => <s>named</s>;`],
  ];

  it.each(fixtures)('%s renders the same', async (_name, code) => {
    const single = await compile({ code });
    const project = await compile({ files: { 'LiveCode.tsx': code } });
    const html = (result: typeof single) =>
      result.renderable.kind === 'component'
        ? renderToStaticMarkup(React.createElement(result.renderable.component))
        : renderToStaticMarkup(result.renderable.element);

    expect(html(project)).toBe(html(single));
    expect(project.via).toBe(single.via);
    expect(project.imports).toEqual(single.imports);
  });

  it.each([false, true])('maps an error to the same line (render budget %s)', async (budget) => {
    const code = `const a: any = null;\n\nconst b = a.missing;\nexport default function App() { return null; }`;
    const onRender = budget ? () => {} : undefined;
    const single = await compile({ code, ...(onRender ? { onRender } : {}) }).catch((error: unknown) => error);
    const project = await compile({ files: { 'LiveCode.tsx': code }, ...(onRender ? { onRender } : {}) }).catch(
      (error: unknown) => error,
    );
    expect(project).toMatchObject({ line: (single as { line: number }).line, message: (single as Error).message });
    expect((single as { line: number }).line).toBe(3);
  });
});
