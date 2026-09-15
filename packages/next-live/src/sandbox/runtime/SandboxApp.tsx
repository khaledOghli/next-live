'use client';

import { createElement, useSyncExternalStore } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { LiveErrorBoundary } from '../../components/LiveErrorBoundary';
import type { SandboxRuntime } from './core';

/** Renders whatever the sandbox runtime last compiled. */
export function SandboxApp({ runtime }: { runtime: SandboxRuntime }): ReactNode {
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);

  if (snapshot.notice !== null) {
    return (
      <p data-next-live-sandbox-notice="" role="status" style={{ font: '14px system-ui, sans-serif', margin: 16 }}>
        {snapshot.notice}
      </p>
    );
  }

  const { renderable } = snapshot;
  const content =
    renderable === null
      ? null
      : renderable.kind === 'component'
        ? createElement(renderable.component as ComponentType<Record<string, unknown>>, snapshot.props)
        : renderable.element;

  return (
    <LiveErrorBoundary resetKey={snapshot.mountKey} onError={runtime.reportRenderError} fallback={null}>
      {content}
    </LiveErrorBoundary>
  );
}
