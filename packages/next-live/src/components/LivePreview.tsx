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
   *
   * Under `<LiveProvider sandbox>` they are copied into the iframe instead,
   * so they must be plain, cloneable data.
   */
  props?: Record<string, unknown>;
  /** Shown until the first compile finishes. Overrides the provider's. */
  fallback?: ReactNode;
  /** Sandbox mode only: the iframe's accessible title. Default "Live preview". */
  title?: string;
  /**
   * Sandbox mode only: the iframe height in pixels, or `'auto'` to follow the
   * snippet's content (up to the sandbox's `maxHeight`). Default `'auto'`.
   */
  height?: number | 'auto';
  /** Sandbox mode only: the iframe's `loading` attribute. Default `'eager'`. */
  loading?: 'eager' | 'lazy';
  /** Sandbox mode only: class name for the iframe element itself. */
  frameClassName?: string;
  /** Sandbox mode only: inline style for the iframe element itself. */
  frameStyle?: React.CSSProperties;
}

/**
 * Renders the compiled component.
 *
 * Until the first compile lands this renders `fallback` - on the server and on
 * the client's first pass alike, which is precisely why hydration cannot
 * mismatch. Give it a skeleton of roughly the right size to avoid layout shift.
 */
export function LivePreview(props: LivePreviewProps): ReactNode {
  const {
    as: Wrapper = 'div',
    className,
    style,
    props: extraProps,
    fallback,
    title,
    height,
    loading,
    frameClassName,
    frameStyle,
  } = props;
  const live = useLiveContext();

  const merged = extraProps ? { ...live.props, ...extraProps } : live.props;
  const placeholder = fallback !== undefined ? fallback : live.fallback;

  if (live.sandbox) {
    const Frame = live.sandbox.Frame;
    return (
      <Frame
        as={Wrapper}
        className={className}
        style={style}
        props={merged}
        fallback={placeholder}
        title={title}
        height={height}
        loading={loading}
        frameClassName={frameClassName}
        frameStyle={frameStyle}
      />
    );
  }

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
