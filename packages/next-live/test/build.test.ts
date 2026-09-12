import { existsSync, readFileSync } from 'node:fs';
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

  /**
   * Next.js requires library authors to preserve this themselves — bundlers
   * strip module-level directives. Without it, consumers hit "you're importing
   * a component that needs useState" the moment they render from a Server
   * Component. Verified once by deliberately removing it and watching the
   * playground build fail.
   */
  it.each(['index.js', 'index.cjs'])('keeps the "use client" directive in %s', (file) => {
    expect(read(file).split('\n')[0]).toMatch(/^["']use client["'];?$/);
  });

  it.each(['server.js', 'server.cjs'])('does not put "use client" in %s', (file) => {
    // The server entry must stay usable from Route Handlers and Server Components.
    expect(read(file)).not.toMatch(/["']use client["']/);
  });

  it('keeps sucrase a dynamic import in the client entry, so it code-splits', () => {
    const source = read('index.js');
    expect(source).toMatch(/import\(["']sucrase["']\)/);
    // A static import would pull the transpiler into the page bundle.
    expect(source).not.toMatch(/^import .* from ["']sucrase["']/m);
  });

  it('leaves react external rather than bundling a second copy', () => {
    // Bundling React would break hooks in evaluated snippets, which rely on
    // sharing the host's instance.
    expect(read('index.js')).toMatch(/from ["']react["']/);
  });

  it('ships type declarations for both entries', () => {
    for (const file of ['index.d.ts', 'server.d.ts']) {
      expect(existsSync(join(dist, file))).toBe(true);
    }
  });
});
