'use client';

import { createElement } from 'react';
import type { ElementType, ReactNode } from 'react';
import { LiveErrorBoundary } from './LiveErrorBoundary';
import { useLiveContext } from '../hooks/useLiveContext';

export interface LivePreviewProps {
  /** Element to wrap the preview in. Default 'div'. */
  as?: ElementType;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Props handed to the compiled component, merged over the provider's.
   * Passed by reference, so live objects - a map view, a store, the active
   * user, arrive intact rather than serialized.
   */
  props?: Record<string, unknown>;
  /** Shown until the first compile finishes. Overrides the provider's. */
  fallback?: ReactNode;
}

/**
 * Renders the compiled component.
 *
 * Until the first compile lands this renders `fallback` - on the server and on
 * the client's first pass alike, which is precisely why hydration cannot
 * mismatch. Give it a skeleton of roughly the right size to avoid layout shift.
 */
export function LivePreview(props: LivePreviewProps): ReactNode {
  const { as: Wrapper = 'div', className, style, props: extraProps, fallback } = props;
  const live = useLiveContext();

  const merged = extraProps ? { ...live.props, ...extraProps } : live.props;
  const placeholder = fallback !== undefined ? fallback : live.fallback;

  let content: ReactNode;
  if (live.Component) {
    content = createElement(live.Component, merged);
  } else if (live.element) {
    content = live.element;
  } else {
    content = placeholder;
  }

  return (
    <Wrapper className={className} style={style}>
      <LiveErrorBoundary
        // Remounting on each successful compile is deliberate: a recompiled
        // component is a new function identity, so its state cannot be carried
        // over, and a stale tree would be worse than a clean one.
        resetKey={live.compileId}
        onError={live.reportRuntimeError}
        // Nothing, rather than the placeholder: a crashed snippet is not
        // "still loading", and <LiveError> is what explains what happened.
        fallback={null}
      >
        {content}
      </LiveErrorBoundary>
    </Wrapper>
  );
}
