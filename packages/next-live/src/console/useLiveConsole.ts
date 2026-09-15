'use client';

import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { LiveConsoleContext } from '../context/LiveConsoleContext';
import type { ConsoleEntry, ConsoleLevel } from '../core/types';
import { createConsoleStore } from './createConsoleStore';

export interface UseLiveConsoleOptions {
  /** Oldest entries are dropped past this. Default 500. */
  maxEntries?: number;
  /** Drop output from earlier compiles when a new one lands. Default true. */
  clearOnCompile?: boolean;
  /** Only these levels are returned. Default: every level. */
  levels?: readonly ConsoleLevel[];
}

export interface LiveConsoleState {
  entries: readonly ConsoleEntry[];
  clear: () => void;
  /** The provider's current compile. */
  compileId: number;
  /** True for output from code that has since been replaced by a newer compile. */
  isStale: (entry: ConsoleEntry) => boolean;
}

const EMPTY: readonly ConsoleEntry[] = [];
const getServerSnapshot = () => EMPTY;

/**
 * Captured console output from the nearest `<LiveProvider>`.
 *
 * Mounting this is what turns capture on - there is nothing to configure on
 * the provider. Mount it together with the provider: one mounted later costs a
 * single recompile, because the snippet has to be re-run with the console
 * swapped in.
 */
export function useLiveConsole(options: UseLiveConsoleOptions = {}): LiveConsoleState {
  const { maxEntries, clearOnCompile, levels } = options;
  const live = useContext(LiveConsoleContext);

  // One store per consumer, so two panels with different options never fight
  // over shared state.
  const store = useMemo(
    () => createConsoleStore({ maxEntries, clearOnCompile }),
    [maxEntries, clearOnCompile],
  );

  // A layout effect, so the provider learns about this consumer before its
  // first debounced compile fires and the snippet runs once, with capture on.
  const attach = live?.attach;
  useLayoutEffect(() => {
    if (!attach) return;
    return attach((entry) => store.push(entry));
  }, [attach, store]);

  const compileId = live?.compileId ?? 0;
  useEffect(() => {
    store.compiled(compileId);
  }, [store, compileId]);

  useEffect(() => {
    if (live === null && process.env.NODE_ENV !== 'production') {
      console.warn('[next-live] <LiveConsole> and useLiveConsole must be rendered inside a <LiveProvider>; they will stay empty.');
    }
  }, [live]);

  const all = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);

  const levelsKey = levels ? [...levels].sort().join(',') : '';
  const entries = useMemo(() => {
    if (!levelsKey) return all;
    const allowed = new Set(levelsKey.split(','));
    return all.filter((entry) => entry.method === 'clear' || allowed.has(entry.level));
  }, [all, levelsKey]);

  const clear = useCallback(() => store.clear(), [store]);
  const isStale = useCallback(
    (entry: ConsoleEntry) => entry.compileId !== undefined && entry.compileId < compileId,
    [compileId],
  );

  return { entries, clear, compileId, isStale };
}
