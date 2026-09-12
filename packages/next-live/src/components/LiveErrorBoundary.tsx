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
  /** True after resetKey changes — allows one render attempt before falling back again. */
  recovering: boolean;
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
  private mounted = true;

  constructor(props: LiveErrorBoundaryProps) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey, recovering: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, recovering: false };
  }

  static getDerivedStateFromProps(
    props: LiveErrorBoundaryProps,
    state: State,
  ): Partial<State> | null {
    // New code compiled — try one render. Only clear a prior error when
    // recovering succeeds; a still-broken snippet keeps the fallback.
    if (props.resetKey !== state.resetKey) {
      return { resetKey: props.resetKey, recovering: true };
    }
    return null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (!this.mounted) return;
    this.props.onError(error);
    if (process.env.NODE_ENV !== 'production') {
      console.error('next-live: error in evaluated code\n', error, info.componentStack);
    }
  }

  override componentDidUpdate(_prevProps: LiveErrorBoundaryProps, prevState: State): void {
    if (prevState.recovering && this.state.recovering && this.state.error !== null) {
      // Recovery render succeeded — drop the stale error from the previous compile.
      this.setState({ error: null, recovering: false });
    }
  }

  override componentWillUnmount(): void {
    this.mounted = false;
  }

  override render(): ReactNode {
    if (this.state.error !== null && !this.state.recovering) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
