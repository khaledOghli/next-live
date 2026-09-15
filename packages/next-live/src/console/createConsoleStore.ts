import type { ConsoleEntry } from '../core/types';

export interface ConsoleStoreOptions {
  /** Oldest entries are dropped past this. Default 500. */
  maxEntries?: number;
  /**
   * Drop entries from earlier compiles when a new one lands, the way a page
   * reload clears DevTools. Entries that arrive late from an old compile (a
   * `setTimeout` that outlived its code) are still kept. Default true.
   */
  clearOnCompile?: boolean;
}

/**
 * An external store of captured entries, shaped for `useSyncExternalStore`.
 *
 * Exported for hosts building their own panel without `<LiveProvider>`:
 * `useLiveRunner({ code, onConsole: store.push })`.
 */
export interface ConsoleStore {
  push(entry: ConsoleEntry): void;
  clear(): void;
  /** Tells the store a compile landed. */
  compiled(compileId: number): void;
  subscribe(listener: () => void): () => void;
  /** Immutable; identity changes only when the entries do. */
  getSnapshot(): readonly ConsoleEntry[];
}

const EMPTY: readonly ConsoleEntry[] = Object.freeze([]);

export function createConsoleStore(options: ConsoleStoreOptions = {}): ConsoleStore {
  const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 500));
  const clearOnCompile = options.clearOnCompile ?? true;

  let entries = EMPTY;
  let latestCompile = 0;
  const listeners = new Set<() => void>();

  const commit = (next: readonly ConsoleEntry[]): void => {
    if (next === entries) return;
    entries = next;
    for (const listener of listeners) listener();
  };

  return {
    push(entry) {
      if (entry.method === 'clear') {
        // Kept as a marker, so a panel can say the console was cleared rather
        // than silently going blank.
        commit([entry]);
        return;
      }
      commit(
        entries.length >= maxEntries
          ? [...entries.slice(entries.length - maxEntries + 1), entry]
          : [...entries, entry],
      );
    },
    clear() {
      commit(EMPTY);
    },
    compiled(compileId) {
      if (compileId <= latestCompile) return;
      latestCompile = compileId;
      if (!clearOnCompile) return;
      const kept = entries.filter(
        (entry) => entry.compileId === undefined || entry.compileId >= compileId,
      );
      if (kept.length !== entries.length) commit(kept.length > 0 ? kept : EMPTY);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return entries;
    },
  };
}
