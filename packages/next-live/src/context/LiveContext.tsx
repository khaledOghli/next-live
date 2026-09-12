'use client';

import { createContext } from 'react';
import type { Context } from 'react';
import type { LiveContextValue } from '../core/types';

/**
 * One context, however many copies of this module exist.
 *
 * The context is cached on a global symbol rather than being a plain
 * module-level constant, because a plain one is only unique per module
 * instance — and there are realistic ways to end up with more than one:
 *
 * - The CommonJS build cannot code-split, so `index.cjs` and `editor.cjs` each
 *   inline their own copy. Without this, `<LiveEditor>` from `next-live/editor`
 *   would read a different context than `<LiveProvider>` provides and throw
 *   "useLiveContext must be called inside a <LiveProvider>".
 * - npm can install two versions of the package side by side.
 *
 * Keying on a symbol means every copy resolves to whichever created it first,
 * so provider and consumer always meet.
 */
const CONTEXT_KEY = Symbol.for('next-live.LiveContext');

type GlobalWithContext = typeof globalThis & {
  [CONTEXT_KEY]?: Context<LiveContextValue | null>;
};

function createLiveContext(): Context<LiveContextValue | null> {
  const store = globalThis as GlobalWithContext;
  const existing = store[CONTEXT_KEY];
  if (existing) return existing;

  /**
   * Null rather than a default value, so `useLiveContext` can tell "outside a
   * provider" apart from "inside a provider that has not compiled yet".
   */
  const context = createContext<LiveContextValue | null>(null);
  context.displayName = 'LiveContext';
  store[CONTEXT_KEY] = context;
  return context;
}

export const LiveContext = createLiveContext();
