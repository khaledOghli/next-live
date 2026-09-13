'use client';

import { createElement, isValidElement } from 'react';
import type { ComponentType, ElementType, ReactNode } from 'react';
import { isRenderableComponent } from '../core/evaluate';
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
  if (live.Component && isRenderableComponent(live.Component)) {
    content = createElement(live.Component as ComponentType<Record<string, unknown>>, merged);
  } else if (live.element && isValidElement(live.element)) {
    content = live.element;
  } else {
    content = placeholder;
  }

  return (
    <Wrapper className={className} style={style}>
      <LiveErrorBoundary
        resetKey={live.compileId}
        onError={live.reportRuntimeError}
        fallback={null}
      >
        {content}
      </LiveErrorBoundary>
    </Wrapper>
  );
}
