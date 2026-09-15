import type { Metadata } from 'next';
import { SandboxDemo } from './SandboxDemo';

export const metadata: Metadata = {
  title: 'Sandbox mode demo',
  robots: { index: false, follow: false },
};

/**
 * A host page for sandbox mode.
 *
 * Deliberately not a runner route, so in a production build (`next build &&
 * next start`) this page is served without `'unsafe-eval'`. The live preview
 * still works, which proves the page never evaluates a snippet itself: only the
 * `/sandbox` page inside the iframe does. In `next dev` every route gets
 * `'unsafe-eval'` because React needs it there.
 */
export default function SandboxDemoPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Sandbox mode</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Every example below runs inside a sandboxed iframe served from <code>/sandbox</code>. This page never compiles
        or runs the code. Pick an example, edit it, and watch the preview, the errors and the console.
      </p>
      <SandboxDemo />
    </main>
  );
}
