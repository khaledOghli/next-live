import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { compile } from '../../src/core/compile';
import { precompiledTransform } from '../../src/core/transpile';
import { precompile, precompileFiles, validateFiles } from '../../src/server';

const FILES = {
  'App.tsx': `import { Button } from './components/Button';\nexport default () => <Button label="Save" />;`,
  'components/Button.tsx': `import { cx } from '@app/ui';\nexport function Button({ label }: { label: string }) { return <button className={cx('btn')}>{label}</button>; }`,
};

describe('precompileFiles', () => {
  it('compiles every file under its own key and names the entry', () => {
    const result = precompileFiles(FILES);
    expect(Object.keys(result.files)).toEqual(['App.tsx', 'components/Button.tsx']);
    expect(result.entry).toBe('App.tsx');
    // Sucrase keeps the source's quote style.
    expect(result.files['App.tsx']?.code).toMatch(/require\(['"]\.\/components\/Button['"]\)/);
  });

  it('never wraps a non-entry file as a bare expression', () => {
    const result = precompileFiles({ 'App.tsx': `<b>entry</b>`, 'Label.tsx': `<b>not entry</b>` });
    expect(result.files['App.tsx']?.expression).toBe(true);
    expect(result.files['Label.tsx']?.expression).toBe(false);
  });

  it('hashes the entry exactly as precompile() does, so existing caches stay warm', () => {
    const single = precompile(FILES['App.tsx'], { filePath: 'App.tsx' });
    expect(precompileFiles(FILES).files['App.tsx']?.hash).toBe(single.hash);
  });

  it('gives a project hash that ignores key order but follows content and entry', () => {
    const reversed = {
      'components/Button.tsx': FILES['components/Button.tsx'],
      'App.tsx': FILES['App.tsx'],
    };
    expect(precompileFiles(reversed, { entry: 'App.tsx' }).hash).toBe(precompileFiles(FILES).hash);
    expect(precompileFiles({ ...FILES, 'App.tsx': `${FILES['App.tsx']}\n` }).hash).not.toBe(precompileFiles(FILES).hash);
    expect(precompileFiles(FILES, { entry: 'components/Button.tsx' }).hash).not.toBe(precompileFiles(FILES).hash);
  });

  it('produces output the client runs without the transpiler', async () => {
    const compiled = precompileFiles(FILES);
    const result = await compile({
      files: FILES,
      transform: precompiledTransform(compiled.files),
      modules: { '@app/ui': { cx: (name: string) => name } },
    });
    expect(result.renderable.kind).toBe('component');
    if (result.renderable.kind !== 'component') return;
    expect(renderToStaticMarkup(React.createElement(result.renderable.component))).toBe(
      '<button class="btn">Save</button>',
    );
  });

  it('names the file a syntax error is in', () => {
    expect(() => precompileFiles({ 'App.tsx': `export default () => null;`, 'Bad.tsx': `\nconst = ;` })).toThrow(
      expect.objectContaining({ code: 'COMPILE', file: 'Bad.tsx', line: 2 }),
    );
  });
});

describe('validateFiles', () => {
  it('accepts imports between files and from the registry', () => {
    const result = validateFiles(FILES, { modules: ['@app/ui'] });
    expect(result.ok).toBe(true);
    expect(result.imports).toEqual(['@app/ui', 'react/jsx-runtime']);
    expect(Object.keys(result.files)).toEqual(['App.tsx', 'components/Button.tsx']);
  });

  it('reports each issue with its file, suggesting a relative path for a typo', () => {
    const result = validateFiles(
      { ...FILES, 'App.tsx': `import { Button } from './components/Buton';\nexport default () => <Button label="x" />;` },
      { modules: ['@app/ui'] },
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        file: 'App.tsx',
        kind: 'unresolved-import',
        specifier: './components/Buton',
        suggestion: './components/Button',
      }),
    ]);
  });

  it('checks every file, including ones nothing imports', () => {
    const result = validateFiles({ ...FILES, 'Scratch.tsx': `export const x = (;` }, { modules: ['@app/ui'] });
    expect(result.issues).toEqual([expect.objectContaining({ file: 'Scratch.tsx', kind: 'syntax' })]);
  });

  it('flags a registry import that is missing, naming the file', () => {
    const result = validateFiles(FILES, { modules: [] });
    expect(result.issues).toEqual([
      expect.objectContaining({ file: 'components/Button.tsx', specifier: '@app/ui' }),
    ]);
  });

  it('throws for an invalid record, which is a bug in the caller', () => {
    expect(() => validateFiles(FILES, { entry: 'Main.tsx' })).toThrow(/is not one of the project files/);
  });
});
