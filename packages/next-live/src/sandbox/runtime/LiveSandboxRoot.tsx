'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { normalizeAllowedOrigins } from '../protocol/validate';
import { createSandboxRuntime } from './core';
import type { SandboxRuntime, SandboxRuntimeOptions } from './core';
import { SandboxApp } from './SandboxApp';

export type LiveSandboxRootProps = Omit<SandboxRuntimeOptions, 'window'>;

/**
 * The React way to build a sandbox page, for frameworks that already render
 * the page with React (a Next.js route, say). Same options as `mountSandbox`.
 *
 * ```tsx
 * 'use client';
 * import { LiveSandboxRoot } from 'next-live/sandbox';
 *
 * export default function SandboxPage() {
 *   return <LiveSandboxRoot modules={modules} allowedOrigins={['https://app.example.com']} />;
 * }
 * ```
 */
export function LiveSandboxRoot(props: LiveSandboxRootProps): ReactNode {
  // Checked while rendering, so a misconfigured page fails loudly in the
  // framework's error overlay instead of silently never connecting.
  const origins = normalizeAllowedOrigins(props.allowedOrigins);
  const originsKey = origins === '*' ? '*' : origins.join(' ');
  const { dangerouslyAllowSameOriginHost, maxCodeChars, maxFiles } = props;

  const latest = useRef(props);
  latest.current = props;
  const [runtime, setRuntime] = useState<SandboxRuntime | null>(null);

  useEffect(() => {
    const created = createSandboxRuntime({
      allowedOrigins: latest.current.allowedOrigins,
      ...(dangerouslyAllowSameOriginHost !== undefined ? { dangerouslyAllowSameOriginHost } : {}),
      ...(maxCodeChars !== undefined ? { maxCodeChars } : {}),
      ...(maxFiles !== undefined ? { maxFiles } : {}),
      // Read at compile time, so a registry that changes after mount is used
      // on the next compile without dropping the connection.
      get modules() {
        return latest.current.modules;
      },
      get scope() {
        return latest.current.scope;
      },
      get transform() {
        return latest.current.transform;
      },
      onConnect: (info) => latest.current.onConnect?.(info),
    });

    document.documentElement.style.margin = '0';
    document.body.style.margin = '0';
    created.start();
    setRuntime(created);

    return () => {
      created.dispose();
      setRuntime(null);
    };
  }, [originsKey, dangerouslyAllowSameOriginHost, maxCodeChars, maxFiles]);

  return runtime ? <SandboxApp runtime={runtime} /> : null;
}
