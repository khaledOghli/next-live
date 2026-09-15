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

  it('keeps prettier out of the root and editor entries', () => {
    expect(read('index.js')).not.toMatch(/prettier/);
    expect(read('editor.js')).not.toMatch(/prettier/);
    expect(read('prettier.js')).toMatch(/createPrettierFormatter/);
  });

  it('leaves react external rather than bundling a second copy', () => {
    // Bundling React would break hooks in evaluated snippets, which rely on
    // sharing the host's instance.
    expect(read('index.js')).toMatch(/from ["']react["']/);
  });

  /**
   * The console panel and its value inspector ship separately, and must never
   * drag the compiler along: a page showing console output already has one
   * from the root entry.
   */
  it('keeps the transpiler and evaluator out of the console entry', () => {
    const source = read('console.js');
    expect(source).toMatch(/LiveConsole/);
    expect(source).not.toMatch(/sucrase/);
    expect(source).not.toMatch(/new Function/);
  });

  /**
   * The sandbox runtime mounts its own React root and brings its own compiler.
   * Neither belongs on a host page, and react-dom in particular must stay out
   * of the root entry, which never needed it.
   */
  /**
   * Pages that never pass `sandbox` must not pay for it: the root entry only
   * holds a dynamic import of the host code, which the app's bundler splits
   * off, and that host code never carries the compiler.
   */
  it('loads the sandbox host on demand, and keeps the compiler out of it', () => {
    const index = read('index.js');
    expect(index).toMatch(/import\(["']next-live\/internal\/sandbox-host["']\)/);
    expect(index).not.toMatch(/MessageChannel/);

    const host = read('sandbox-host.js');
    expect(host).toMatch(/createSandboxProvider/);
    expect(host).not.toMatch(/sucrase/);
    expect(host).not.toMatch(/new Function/);
  });

  it('keeps react-dom out of the root entry; only the sandbox runtime mounts a root', () => {
    expect(read('index.js')).not.toMatch(/react-dom/);
    expect(read('sandbox.js')).toMatch(/from ["']react-dom\/client["']/);
  });

  it.each(['index', 'editor', 'server', 'prettier', 'console', 'sandbox'])('ships type declarations for %s', (entry) => {
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
      // 38.5 KB at 1.0.0. 1.1 adds console capture (~3.9 KB), multi-file
      // projects (~12 KB across the compiler, path resolver and source state)
      // and the sandbox switch. Measured ~63 KB raw, ~12 KB minified + gzip.
      'index.js': 72,
      // Measured ~21.7 KB at 1.0.0. 1.1 adds the `file` prop for multi-file
      // snippets, which does not fit in the 300 bytes that were left.
      'editor.js': 24,
      // 8.8 KB at 1.0.0; 1.1 adds precompileFiles, validateFiles and the
      // project path resolver they share with the client. Measured ~14.2 KB.
      'server.js': 16,
      'prettier.js': 3,
      // Measured ~17.7 KB; the clone-safe value inspector is half of it.
      'console.js': 20,
      // Loaded only by the sandbox page: the whole engine plus the runtime and
      // protocol. Measured ~70.6 KB.
      'sandbox.js': 82,
      // Loaded on demand by `<LiveProvider sandbox>` only.
      'sandbox-host.js': 45,
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

  it.each(['index.ts', 'editor.ts', 'console.ts', 'sandbox.ts'])('%s declares "use client"', (entry) => {
    const first = readFileSync(join(src, entry), 'utf8').split('\n')[0] ?? '';
    expect(first).toMatch(/^["']use client["'];?$/);
  });
});

/**
 * The Node-floor CI job runs `test:node`, which excludes `**\/*.test.tsx`.
 *
 * That exclusion is a filename pattern, so it only holds while every
 * jsdom-requiring suite is a `.tsx` file. jsdom pulls in undici, which needs
 * Node 22, so a jsdom docblock in a `.ts` file makes the floor job fail on a
 * test-tooling constraint the published package does not have, exactly how the
 * job broke once already.
 */
describe('test file conventions', () => {
  const testDir = dirname(fileURLToPath(import.meta.url));

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });

  it('keeps every jsdom suite in a .tsx file', () => {
    const misplaced = walk(testDir)
      .filter((file) => /\.test\.[cm]?ts$/.test(file))
      .filter((file) => /@vitest-environment\s+jsdom/.test(readFileSync(file, 'utf8')));

    expect(misplaced).toEqual([]);
  });
});
