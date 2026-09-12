// This route is a deliberate double control.
//
// 1. It is a Server Component (no 'use client') importing the library directly,
//    so the build fails with "you're importing a component that needs useState"
//    if the published bundle ever loses its 'use client' directive.
//
// 2. It is NOT in proxy.ts's RUNNER_ROUTES, so in a production build it has no
//    'unsafe-eval' and evaluation is blocked on purpose. Rendering it then
//    proves the CSP scoping works, and that a blocked snippet reports an
//    actionable message instead of a raw EvalError.
import { LiveEditor, LiveError, LivePreview, LiveProvider } from 'next-live';

export default function RscCheckPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Server Component import check</h1>
      <p style={{ maxWidth: '42rem', opacity: 0.7 }}>
        In a production build this route has no <code>&apos;unsafe-eval&apos;</code>, so the
        preview below is expected to fail with a CSP message. That is the control
        proving the directive is scoped to the runner routes only.
      </p>
      <LiveProvider code={'export default () => <b>imported from an RSC</b>;'}>
        <LiveEditor />
        <LivePreview />
        <LiveError />
      </LiveProvider>
    </main>
  );
}
