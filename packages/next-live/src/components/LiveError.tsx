'use client';

import type { ElementType, ReactNode } from 'react';
import { errorPosition } from '../core/positions';
import { useLiveContext } from '../hooks/useLiveContext';

export interface LiveErrorProps {
  as?: ElementType;
  className?: string;
  style?: React.CSSProperties;
  /** Replaces the default rendering entirely. */
  children?: (error: Error) => ReactNode;
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

  const position = errorPosition(live.error);
  const location =
    position !== null
      ? `Line ${position.line}${position.column !== undefined ? `:${position.column}` : ''} - `
      : '';

  const message = live.formatError
    ? live.formatError(live.error, {
        line: position?.line,
        column: position?.column,
      })
    : `${location}${live.error.message}`;

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
      {message}
    </Wrapper>
  );
}
