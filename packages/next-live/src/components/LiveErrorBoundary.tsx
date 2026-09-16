'use client';

import { Component } from 'react';
import type { ReactNode } from 'react';

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
  /** True after resetKey changes. Allows one render attempt before falling back again. */
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
    // New code compiled: try one render. Only clear a prior error when
    // recovering succeeds; a still-broken snippet keeps the fallback.
    if (props.resetKey !== state.resetKey) {
      return { resetKey: props.resetKey, recovering: true };
    }
    return null;
  }

  // No logging here. React 19 already reports every error a boundary catches
  // (through `onCaughtError`, `console.error` by default), and a second log of
  // the same error would show up twice, as two issues in the Next.js dev overlay.
  // The error reaches the host through `onError`, which is how `<LiveError>`
  // shows it.
  override componentDidCatch(error: Error): void {
    if (!this.mounted) return;
    this.props.onError(error);
  }

  override componentDidUpdate(_prevProps: LiveErrorBoundaryProps, prevState: State): void {
    if (prevState.recovering && this.state.recovering && this.state.error !== null) {
      // Recovery render succeeded. Drop the stale error from the previous compile.
      this.setState({ error: null, recovering: false });
    }
  }

  // Set here as well as on construction: in development, Strict Mode unmounts
  // and remounts every component, and a flag cleared by that simulated unmount
  // must come back, or every later error would be ignored.
  override componentDidMount(): void {
    this.mounted = true;
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
