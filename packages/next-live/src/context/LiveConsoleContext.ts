'use client';

import { createContext } from 'react';
import type { Context } from 'react';
import type { ConsoleEntry } from '../core/types';

export interface LiveConsoleContextValue {
  /**
   * Starts delivering captured entries to `listener` and switches capture on
   * for the provider. Returns the function that stops delivery.
   */
  attach: (listener: (entry: ConsoleEntry) => void) => () => void;
  /** The provider's current compile, for telling stale entries apart. */
  compileId: number;
}

/**
 * Kept apart from `LiveContext` on purpose. That value is rebuilt on every
 * provider render, and console output arrives far more often than code
 * changes, so sharing it would re-render the editor and preview per log line.
 *
 * Cached on a global symbol for the same reason `LiveContext` is: the console
 * entry is built separately and inlines its own copy of this module.
 */
const CONTEXT_KEY = Symbol.for('next-live.LiveConsoleContext');

type GlobalWithContext = typeof globalThis & {
  [CONTEXT_KEY]?: Context<LiveConsoleContextValue | null>;
};

function createLiveConsoleContext(): Context<LiveConsoleContextValue | null> {
  const store = globalThis as GlobalWithContext;
  const existing = store[CONTEXT_KEY];
  if (existing) return existing;

  const context = createContext<LiveConsoleContextValue | null>(null);
  context.displayName = 'LiveConsoleContext';
  store[CONTEXT_KEY] = context;
  return context;
}

export const LiveConsoleContext = createLiveConsoleContext();
