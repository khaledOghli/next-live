import { describe, expect, it } from 'vitest';
import { compileModule } from '../src/core/compile';
import { validateSnippet, validateSnippets } from '../src/validate';
import { ModuleNotFoundError } from '../src/core/errors';

describe('compileModule', () => {
  it('returns raw exports for code that is not a component', async () => {
    const { exports } = await compileModule({
      code: `export function validate(n: number) { return n > 0; }
export const schema = { type: 'number' };`,
    });

    expect((exports['validate'] as (n: number) => boolean)(5)).toBe(true);
    expect(exports['schema']).toEqual({ type: 'number' });
  });

  it('does not demand a component, unlike compile()', async () => {
    // compile() throws NoComponentError here; this is the whole point of the
    // separate entry point.
    await expect(compileModule({ code: `export const answer = 42;` })).resolves.toMatchObject({
      exports: { answer: 42 },
    });
  });

  it('exposes a default export', async () => {
    const { exports } = await compileModule({ code: `export default (n) => n * 2;` });
    expect((exports['default'] as (n: number) => number)(21)).toBe(42);
  });

  it('resolves imports the same way compile() does', async () => {
    const { exports } = await compileModule({
      code: `import { rate } from '@app/config';\nexport const total = 100 * rate;`,
      modules: { '@app/config': { rate: 1.2 } },
    });
    expect(exports['total']).toBeCloseTo(120);
  });

  it('still reports an unresolved import', async () => {
    await expect(
      compileModule({ code: `import { x } from 'nope';\nexport const y = x;` }),
    ).rejects.toThrow(ModuleNotFoundError);
  });

  it('maps a runtime throw back to the snippet line', async () => {
    await expect(
      compileModule({ code: `const a = 1;\n\nthrow new Error('boom');` }),
    ).rejects.toMatchObject({ line: 3 });
  });
});

/**
 * The failure this guards against: snippets live in a database, so renaming
 * something in the SDK breaks them silently - the error surfaces for whoever
 * opens that app next, not for whoever made the change. Validation in CI turns
 * that into a failed build.
 */
describe('validateSnippet', () => {
  const modules = ['@app/store', '@app/ui'];

  it('accepts a snippet whose imports are all registered', () => {
    const result = validateSnippet(
      `import { useCart } from '@app/store';\nexport default () => <b>{useCart().length}</b>;`,
      { modules },
    );
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('reports an unregistered import, with a suggestion', () => {
    const result = validateSnippet(
      `import { useCart } from '@app/stroe';\nexport default () => <b>{useCart().length}</b>;`,
      { modules },
    );

    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({
      kind: 'unresolved-import',
      specifier: '@app/stroe',
      suggestion: '@app/store',
    });
  });

  it('reports a syntax error with a position', () => {
    const result = validateSnippet(`export default () => <div>`, { modules });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe('syntax');
    expect(result.issues[0]?.line).toBeTypeOf('number');
  });

  it('accepts the built-in modules without them being registered', () => {
    const result = validateSnippet(
      `import { useState } from 'react';\nexport default () => { useState(); return <b/>; };`,
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a prefix entry for any subpath beneath it', () => {
    const result = validateSnippet(
      `import C from 'big-lib/charts/Bar';\nexport default () => <C/>;`,
      { modules: ['big-lib/'] },
    );
    expect(result.ok).toBe(true);
  });

  it('ignores asset imports', () => {
    const result = validateSnippet(`import './a.css';\nexport default () => <b/>;`, { modules });
    expect(result.ok).toBe(true);
  });

  it('lists every specifier it found', () => {
    const result = validateSnippet(
      `import { a } from '@app/store';\nimport { b } from '@app/ui';\nexport default () => <b>{a}{b}</b>;`,
      { modules },
    );
    expect(result.imports).toContain('@app/store');
    expect(result.imports).toContain('@app/ui');
  });

  it('accepts a registry object as well as a list of keys', () => {
    const result = validateSnippet(
      `import { x } from '@app/store';\nexport const y = x;`,
      { modules: { '@app/store': {} } },
    );
    expect(result.ok).toBe(true);
  });

  it('validates a bare expression snippet', () => {
    expect(validateSnippet(`<b>hello</b>`, { modules }).ok).toBe(true);
  });

  it('rejects snippets over maxSourceBytes before transpile', () => {
    const result = validateSnippet(`export default () => <b/>;`, {
      modules,
      maxSourceBytes: 10,
    });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe('source-too-large');
  });

  it('forbids node: builtins when opted in', () => {
    const result = validateSnippet(
      `import fs from 'node:fs';\nexport default () => String(fs);`,
      { modules, forbidNodeBuiltins: true },
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({
      kind: 'forbidden-import',
      specifier: 'node:fs',
    });
  });

  it('forbids remote imports when opted in', () => {
    const result = validateSnippet(
      `import x from 'https://cdn.example/x.js';\nexport default () => String(x);`,
      { modules, forbidRemoteImports: true },
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe('forbidden-import');
  });

  it('denies specifiers even when registered', () => {
    const result = validateSnippet(
      `import { useCart } from '@app/store';\nexport default () => useCart().length;`,
      { modules, denySpecifiers: ['@app/store'] },
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({
      kind: 'forbidden-import',
      specifier: '@app/store',
    });
  });

  it('denies a prefix subtree via denySpecifiers', () => {
    const result = validateSnippet(
      `import C from 'big-lib/charts/Bar';\nexport default () => <C/>;`,
      { modules: ['big-lib/'], denySpecifiers: ['big-lib/'] },
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe('forbidden-import');
  });

  it('keeps default validation unchanged without policy flags', () => {
    const result = validateSnippet(
      `import { useCart } from '@app/store';\nexport default () => <b/>;`,
      { modules },
    );
    expect(result.ok).toBe(true);
  });

  it('never evaluates the snippet', () => {
    // Safe to run over stored content in CI: a side effect at module scope
    // must not fire, and an import that would throw must not be executed.
    const marker = { fired: false };
    (globalThis as Record<string, unknown>)['__validateProbe'] = marker;

    const result = validateSnippet(
      `globalThis.__validateProbe.fired = true;\nexport default () => <b/>;`,
    );

    expect(result.ok).toBe(true);
    expect(marker.fired).toBe(false);
  });
});

describe('validateSnippets', () => {
  it('returns only the snippets that have problems', () => {
    const failures = validateSnippets(
      [
        { id: 'good', source: `import { a } from '@app/store';\nexport const b = a;` },
        { id: 'bad', source: `import { a } from '@app/gone';\nexport const b = a;` },
        { id: 'broken', source: `export default () => <div>` },
      ],
      { modules: ['@app/store'] },
    );

    expect(failures.map((f) => f.id)).toEqual(['bad', 'broken']);
  });

  it('returns an empty array when everything is fine', () => {
    const failures = validateSnippets([{ id: 'a', source: `export const x = 1;` }]);
    expect(failures).toEqual([]);
  });
});
