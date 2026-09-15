'use client';

import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { formatConsoleArgs } from '../core/format-value';
import { serializeValues } from '../core/serialize-value';
import type { SerializedValue } from '../core/serialize-value';
import type { ConsoleEntry, ConsoleLevel } from '../core/types';
import { useLiveConsole } from './useLiveConsole';
import type { LiveConsoleState } from './useLiveConsole';

export interface LiveConsoleEntryInfo {
  /** The whole call as one line of text. */
  preview: string;
  /** Clone-safe copies of the arguments, for a custom inspector. */
  serialized: readonly SerializedValue[];
  /** Output from code that has since been replaced by a newer compile. */
  stale: boolean;
}

export interface LiveConsoleProps {
  /** Only show these levels. Default: every level. */
  levels?: readonly ConsoleLevel[];
  /** Oldest entries are dropped past this. Default 500. */
  maxEntries?: number;
  /** Drop output from earlier compiles when a new one lands. Default true. */
  clearOnCompile?: boolean;
  /** Render the built-in "Clear console" button. Default true. */
  clearButton?: boolean;
  /**
   * Announce new output to screen readers. Default false: a chatty snippet
   * would otherwise talk over everything else on the page.
   */
  announce?: boolean;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
  /** Shown while there is no output. */
  emptyState?: ReactNode;
  /** Replaces the content of each row. */
  renderEntry?: (entry: ConsoleEntry, info: LiveConsoleEntryInfo) => ReactNode;
  /** Replaces the whole panel, for a completely custom UI. */
  children?: (state: LiveConsoleState) => ReactNode;
}

const serializedCache = new WeakMap<ConsoleEntry, readonly SerializedValue[]>();

/**
 * Serializes lazily and once per entry. Capture keeps raw values, so nothing
 * is paid for output that is filtered out or never rendered.
 */
function serializedArgs(entry: ConsoleEntry): readonly SerializedValue[] {
  if (entry.serialized) return entry.serialized;
  let cached = serializedCache.get(entry);
  if (!cached) {
    cached = serializeValues(entry.args);
    serializedCache.set(entry, cached);
  }
  return cached;
}

/**
 * Shows `console.*` output from the snippet in the nearest `<LiveProvider>`.
 *
 * Unstyled: rows carry `data-level`, `data-method` and `data-stale` for CSS,
 * and are indented by `console.group` depth.
 */
export function LiveConsole(props: LiveConsoleProps): ReactNode {
  const {
    levels,
    maxEntries,
    clearOnCompile,
    clearButton = true,
    announce = false,
    className,
    style,
    'aria-label': ariaLabel = 'Console output',
    emptyState = null,
    renderEntry,
    children,
  } = props;

  const state = useLiveConsole({ levels, maxEntries, clearOnCompile });
  const logRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  // Follow new output only while the reader is already at the bottom, so
  // scrolling up to read an earlier entry is not yanked away.
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log && pinnedRef.current) log.scrollTop = log.scrollHeight;
  }, [state.entries]);

  if (children) return children(state);

  return (
    <div data-next-live-console="" className={className} style={style}>
      <div
        ref={logRef}
        role="log"
        aria-label={ariaLabel}
        aria-live={announce ? 'polite' : 'off'}
        onScroll={(event) => {
          const log = event.currentTarget;
          pinnedRef.current = log.scrollHeight - log.scrollTop - log.clientHeight < 4;
        }}
      >
        {state.entries.length === 0
          ? emptyState
          : state.entries.map((entry) => {
              const serialized = serializedArgs(entry);
              const stale = state.isStale(entry);
              const preview =
                entry.method === 'clear' ? 'Console was cleared' : formatConsoleArgs(serialized);
              return (
                <div
                  key={entry.id}
                  data-level={entry.level}
                  data-method={entry.method}
                  data-stale={stale ? '' : undefined}
                  style={entry.depth > 0 ? { paddingInlineStart: `${entry.depth * 12}px` } : undefined}
                >
                  {renderEntry ? renderEntry(entry, { preview, serialized, stale }) : preview}
                </div>
              );
            })}
      </div>
      {clearButton ? (
        <button type="button" data-next-live-console-clear="" onClick={state.clear}>
          Clear console
        </button>
      ) : null}
    </div>
  );
}
