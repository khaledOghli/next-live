'use client';

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createSandboxRuntime } from './core';
import type { SandboxRuntimeOptions } from './core';
import { SandboxApp } from './SandboxApp';

export interface MountSandboxOptions extends SandboxRuntimeOptions {
  /** Element to render snippets into. Default: a new `<div>` appended to `<body>`. */
  container?: HTMLElement;
}

export interface SandboxMount {
  /** Disconnects from the host page and unmounts everything. */
  dispose(): void;
}

/**
 * Turns the current page into a next-live sandbox: it waits for the page that
 * embeds it to connect, then compiles and renders the snippets it sends.
 *
 * ```ts
 * import { mountSandbox } from 'next-live/sandbox';
 * import * as ui from './my-ui-kit';
 *
 * mountSandbox({
 *   modules: { '@acme/ui': ui },
 *   allowedOrigins: ['https://app.example.com'],
 * });
 * ```
 *
 * Throws straight away if `allowedOrigins` is missing or malformed.
 */
export function mountSandbox(options: MountSandboxOptions): SandboxMount {
  const runtime = createSandboxRuntime(options);
  const win = options.window ?? window;
  const doc = win.document;

  // The frame reports the document's height to the host; default body margins
  // would add a gap nobody asked for.
  doc.documentElement.style.margin = '0';
  doc.body.style.margin = '0';

  const created = options.container === undefined;
  const container = options.container ?? doc.body.appendChild(doc.createElement('div'));
  if (created) container.id = 'next-live-sandbox';

  const root = createRoot(container);
  root.render(createElement(SandboxApp, { runtime }));
  runtime.start();

  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      runtime.dispose();
      root.unmount();
      if (created) container.remove();
    },
  };
}
