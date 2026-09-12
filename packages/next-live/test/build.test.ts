import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const built = existsSync(join(dist, 'index.js'));

/**
 * Assertions about the *published* shape.
 *
 * These are the failures that cannot be caught any other way: everything works
 * in the monorepo and breaks only once someone installs the tarball. They are
 * skipped when `dist` is absent so `npm test` still works on a fresh checkout;
 * CI runs the build first.
 */
describe.skipIf(!built)('build output', () => {
  const read = (file: string) => readFileSync(join(dist, file), 'utf8');

  const SERVER_ENTRIES = ['server.js', 'server.cjs'];

  /**
   * Derived, never hardcoded.
   *
   * A fixed list of entry filenames is exactly how the shared chunk slipped
   * through: adding a second client entry made tsup split `createContext` into
   * `chunk-*.js`, which the list did not know about, leaving a client-only
   * module with no directive on it.
   */
  const clientFiles = readdirSync(dist).filter(
    (file) => /\.(js|cjs)$/.test(file) && !SERVER_ENTRIES.includes(file),
  );

  /**
   * Next.js requires library authors to preserve this themselves - bundlers
   * strip module-level directives. Without it, consumers hit "you're importing
   * a component that needs useState" the moment they render from a Server
   * Component. Verified once by deliberately removing it and watching the
   * playground build fail.
   */
  it('stamps every client-graph file, shared chunks included', () => {
    const missing = clientFiles.filter(
      (file) => !/^["']use client["'];?$/.test(read(file).split('\n')[0] ?? ''),
    );
    expect(missing).toEqual([]);
    // Guard against the filter silently matching nothing.
    expect(clientFiles.length).toBeGreaterThanOrEqual(4);
  });

  it.each(SERVER_ENTRIES)('does not put "use client" in %s', (file) => {
    // The server entry must stay usable from Route Handlers and Server Components.
    expect(read(file)).not.toMatch(/["']use client["']/);
  });

  it('keeps sucrase a dynamic import in the client entry, so it code-splits', () => {
    const source = read('index.js');
    expect(source).toMatch(/import\(["']sucrase["']\)/);
    // A static import would pull the transpiler into the page bundle.
    expect(source).not.toMatch(/^import .* from ["']sucrase["']/m);
  });

  /**
   * `precompiledTransform` deliberately lives in the client entry. It is a pure
   * closure over a value, but when it lived in next-live/server a client
   * importing it dragged Sucrase into the page bundle - the exact cost
   * precompiling exists to avoid.
   */
  it('exposes precompiledTransform without pulling in the transpiler', () => {
    expect(read('index.js')).toMatch(/precompiledTransform/);
  });

  /**
   * The editor is the only thing that needs a syntax highlighter, and a page
   * that merely runs stored snippets never edits them. Measured: with the
   * editor in the root entry a preview-only consumer paid 97.2 KB; separating
   * it dropped that to 16.1 KB.
   */
  it('keeps prism out of the root entry', () => {
    expect(read('index.js')).not.toMatch(/prism-react-renderer/);
  });

  it('loads prism only from the editor entry', () => {
    expect(read('editor.js')).toMatch(/prism-react-renderer/);
  });

  it('leaves react external rather than bundling a second copy', () => {
    // Bundling React would break hooks in evaluated snippets, which rely on
    // sharing the host's instance.
    expect(read('index.js')).toMatch(/from ["']react["']/);
  });

  it.each(['index', 'editor', 'server'])('ships type declarations for %s', (entry) => {
    expect(existsSync(join(dist, `${entry}.d.ts`))).toBe(true);
    expect(existsSync(join(dist, `${entry}.d.cts`))).toBe(true);
  });

  /**
   * A budget, not a benchmark.
   *
   * The point of this package is to stay small, and nothing else in the suite
   * would notice it slowly getting heavy. Ceilings sit roughly 15% above the
   * sizes at the time of writing, so ordinary changes pass and a new
   * dependency does not slip in unnoticed. If one of these fails, decide
   * whether the growth is worth it - then move the number deliberately.
   */
  describe('size budget', () => {
    const BUDGET_KB: Record<string, number> = {
      'index.js': 45,
      'editor.js': 12,
      'server.js': 10,
    };

    it.each(Object.entries(BUDGET_KB))('%s stays under %i KB', (file, limitKb) => {
      const actualKb = statSync(join(dist, file)).size / 1024;
      expect(actualKb).toBeLessThan(limitKb);
    });
  });
});

/**
 * The source must be honest about being client-only too.
 *
 * `dist` is stamped by a post-build script, so a missing directive in source is
 * invisible in the published package, until someone compiles the package
 * directly instead of consuming `dist`, at which point a barrel without the
 * directive silently becomes a server module.
 */
describe('source directives', () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

  it.each(['index.ts', 'editor.ts'])('%s declares "use client"', (entry) => {
    const first = readFileSync(join(src, entry), 'utf8').split('\n')[0] ?? '';
    expect(first).toMatch(/^["']use client["'];?$/);
  });
});
