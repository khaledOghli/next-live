'use client';

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

export interface LiveErrorBoundaryProps {
  children: ReactNode;
  onError: (error: Error) => void;
  /**
   * Changing this resets the boundary. Wire it to the compile id so fixing a
   * broken snippet recovers on its own, with no manual retry.
   */
  resetKey: unknown;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
  resetKey: unknown;
}

/**
 * Contains failures in evaluated code so a bad snippet cannot take down the
 * host application.
 *
 * React recovers from an error by client-rendering the whole nearest boundary,
 * so this one is kept as tight around the preview as possible - anything else
 * on the page is unaffected.
 */
export class LiveErrorBoundary extends Component<LiveErrorBoundaryProps, State> {
  constructor(props: LiveErrorBoundaryProps) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: LiveErrorBoundaryProps,
    state: State,
  ): Partial<State> | null {
    // New code compiled, so give it a clean slate.
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey };
    }
    return null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError(error);
    if (process.env.NODE_ENV !== 'production') {
      console.error('next-live: error in evaluated code\n', error, info.componentStack);
    }
  }

  override render(): ReactNode {
    if (this.state.error !== null) return this.props.fallback ?? null;
    return this.props.children;
  }
}
