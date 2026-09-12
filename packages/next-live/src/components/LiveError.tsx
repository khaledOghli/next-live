'use client';

import type { ElementType, ReactNode } from 'react';
import { useLiveContext } from '../hooks/useLiveContext';

export interface LiveErrorProps {
  as?: ElementType;
  className?: string;
  style?: React.CSSProperties;
  /** Replaces the default rendering entirely. */
  children?: (error: Error) => ReactNode;
}

interface PositionedError extends Error {
  line?: number;
  column?: number;
}

/**
 * Displays the current compile or runtime error, and renders nothing when the
 * snippet is healthy.
 */
export function LiveError(props: LiveErrorProps): ReactNode {
  const { as: Wrapper = 'pre', className, style, children } = props;
  const live = useLiveContext();

  if (!live.error) return null;
  if (children) return <>{children(live.error)}</>;

  const error = live.error as PositionedError;
  const location =
    error.line !== undefined
      ? `Line ${error.line}${error.column !== undefined ? `:${error.column}` : ''} — `
      : '';

  return (
    <Wrapper
      className={className}
      role="alert"
      style={{
        margin: 0,
        padding: '0.75rem 1rem',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        fontSize: '0.8125rem',
        lineHeight: 1.5,
        color: '#fff',
        background: '#b3261e',
        ...style,
      }}
    >
      {location}
      {error.message}
    </Wrapper>
  );
}
