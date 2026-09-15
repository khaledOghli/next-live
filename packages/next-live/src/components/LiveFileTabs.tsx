'use client';

import { useId, useRef } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import type { PositionedError } from '../core/positions';
import { useLiveContext } from '../hooks/useLiveContext';

export interface LiveFileTabsProps {
  className?: string;
  style?: CSSProperties;
  /** Names the tab list for screen readers. Default "Files". */
  'aria-label'?: string;
  /**
   * The order tabs appear in. Files left out follow in their original order.
   * Default: the order of the `files` object.
   */
  order?: readonly string[];
  /** The id of the element the tabs control, usually the editor's wrapper. */
  panelId?: string;
  /** Replaces a tab's label, e.g. to show an icon or drop the directory. */
  renderTab?: (file: string, state: { selected: boolean; hasError: boolean; isEntry: boolean }) => ReactNode;
}

/**
 * One tab per file of a multi-file snippet; selecting a tab switches what
 * `<LiveEditor>` shows. Renders nothing for a single `code` snippet.
 *
 * Unstyled. Tabs carry `aria-selected`, plus `data-entry` on the entry file
 * and `data-error` on the file the current error came from.
 */
export function LiveFileTabs(props: LiveFileTabsProps): ReactNode {
  const { className, style, 'aria-label': ariaLabel = 'Files', order, panelId, renderTab } = props;
  const live = useLiveContext();
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const { files, activeFile, entry, setActiveFile } = live;
  if (!files || !setActiveFile) return null;

  const keys = Object.keys(files);
  const ordered = order
    ? [...order.filter((file) => keys.includes(file)), ...keys.filter((file) => !order.includes(file))]
    : keys;
  const errorFile = (live.error as PositionedError | null)?.file;
  // Exactly one tab must be reachable with Tab, even if activeFile is stale.
  const focusable = activeFile !== undefined && ordered.includes(activeFile) ? activeFile : ordered[0];

  const moveTo = (index: number) => {
    const file = ordered[(index + ordered.length) % ordered.length];
    if (file === undefined) return;
    setActiveFile(file);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-file-index="${ordered.indexOf(file)}"]`)?.focus();
  };

  // The WAI-ARIA tabs pattern with automatic activation: arrows move and select.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target =
      event.key === 'ArrowRight'
        ? index + 1
        : event.key === 'ArrowLeft'
          ? index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? ordered.length - 1
              : null;
    if (target === null) return;
    event.preventDefault();
    moveTo(target);
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className={className}
      style={style}
      data-next-live-file-tabs=""
    >
      {ordered.map((file, index) => {
        const selected = file === activeFile;
        const hasError = errorFile === file;
        const isEntry = file === entry;
        return (
          <button
            key={file}
            type="button"
            role="tab"
            id={`${baseId}-${index}`}
            data-file-index={index}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={file === focusable ? 0 : -1}
            data-entry={isEntry ? '' : undefined}
            data-error={hasError ? '' : undefined}
            onClick={() => setActiveFile(file)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {renderTab ? renderTab(file, { selected, hasError, isEntry }) : file}
          </button>
        );
      })}
    </div>
  );
}
