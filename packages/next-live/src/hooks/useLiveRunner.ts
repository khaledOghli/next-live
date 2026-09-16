'use client';

import type { LiveRunnerState, UseLiveRunnerOptions } from '../core/types';
import { useInPageRunner } from './useInPageRunner';

/**
 * The headless engine behind `<LiveProvider>` - compiles a snippet and hands
 * back a component, for hosts building their own UI.
 *
 * Compilation never runs during render or on the server. The first client
 * render produces exactly what the server produced (no component, no error),
 * so there is nothing for React to find mismatched during hydration; the
 * compile starts afterwards, in an effect.
 *
 * For snippets that are not components, use {@link useLiveModule}.
 */
export function useLiveRunner(options: UseLiveRunnerOptions): LiveRunnerState {
  // One implementation for the hook and the provider, so they cannot drift.
  return useInPageRunner(options, null);
}
