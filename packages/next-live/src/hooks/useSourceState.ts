'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeProjectPath } from '../core/project';
import type { LiveProjectState } from '../core/types';

type FilesRecord = Readonly<Record<string, string>>;

/** The multi-file state, with every field present. */
export type ProjectState = Required<LiveProjectState>;

export interface SourceOptions {
  code?: string;
  files?: FilesRecord;
  entry?: string;
  activeFile?: string;
  onCodeChange?: (code: string) => void;
  onFilesChange?: (files: FilesRecord, changedFile: string | undefined) => void;
  onActiveFileChange?: (file: string) => void;
}

export interface SourceState {
  /** The snippet, or the active file's source for a multi-file snippet. */
  code: string;
  setCode: (code: string) => void;
  /** Present only for multi-file snippets. */
  project?: ProjectState;
}

/**
 * The key a host used for a file, accepting any spelling of its path, so
 * `activeFile="./App.tsx"` finds a file keyed `App.tsx`.
 */
export function findFileKey(files: FilesRecord, name: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(files, name)) return name;
  const target = normalizeProjectPath(name);
  if (target === null) return undefined;
  return Object.keys(files).find((key) => normalizeProjectPath(key) === target);
}

/** Same keys, same order, same sources. Key order matters: the first file is the default entry. */
function sameFiles(a: FilesRecord | undefined, b: FilesRecord | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return aKeys.length === bKeys.length && aKeys.every((key, i) => key === bKeys[i] && a[key] === b[key]);
}

/**
 * Returns the previous record while the content is unchanged.
 *
 * Hosts write `files={{ 'App.tsx': app, 'Button.tsx': button }}` inline, which
 * is a new object every render. Keying the compile on identity would recompile
 * on every parent render; keying it on content means only real edits do.
 */
function useStableFiles(files: FilesRecord | undefined): FilesRecord | undefined {
  const ref = useRef(files);
  if (!sameFiles(ref.current, files)) ref.current = files;
  return ref.current;
}

/**
 * What the snippet's source currently is, and how to change it.
 *
 * A single `code` snippet behaves exactly as it always has. With `files`, the
 * same `code`/`setCode` pair points at the active file, which is what lets an
 * unmodified `<LiveEditor>` edit whichever tab is selected.
 */
export function useSourceState(options: SourceOptions): SourceState {
  const { code: codeProp = '', entry: entryProp, activeFile: activeFileProp } = options;
  const filesProp = useStableFiles(options.files);

  const latest = useRef(options);
  latest.current = options;

  // Single snippet: controlled by the prop, editable from inside.
  const [code, setCodeState] = useState(codeProp);
  useEffect(() => {
    setCodeState(codeProp);
  }, [codeProp]);

  // Multi-file: the same controlled-but-editable model, per record. A host
  // echoing edits back through `onFilesChange` passes equal content, which must
  // not count as a change or every keystroke would compile twice.
  const [files, setFilesState] = useState(filesProp);
  useEffect(() => {
    setFilesState((previous) => (sameFiles(previous, filesProp) ? previous : filesProp));
  }, [filesProp]);

  // Switching from `code` to `files` has no state yet on the first render.
  const current = filesProp !== undefined ? (files ?? filesProp) : undefined;
  const filesRef = useRef(current);
  filesRef.current = current;

  const [activeInternal, setActiveInternal] = useState<string | undefined>(undefined);

  const entryKey = current
    ? ((entryProp !== undefined ? findFileKey(current, entryProp) : undefined) ?? Object.keys(current)[0])
    : undefined;
  const requested = activeFileProp ?? activeInternal;
  const activeKey = current
    ? ((requested !== undefined ? findFileKey(current, requested) : undefined) ?? entryKey)
    : undefined;

  const activeRef = useRef(activeKey);
  activeRef.current = activeKey;

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || !current || activeFileProp === undefined) return;
    if (findFileKey(current, activeFileProp) === undefined) {
      console.warn(`[next-live] activeFile '${activeFileProp}' is not one of the files; showing the entry file instead.`);
    }
  }, [current, activeFileProp]);

  const setFile = useCallback((file: string, next: string) => {
    const record = filesRef.current;
    if (!record) return;
    const key = findFileKey(record, file) ?? file;
    if (record[key] === next) return;
    const updated = { ...record, [key]: next };
    // Updated eagerly, so two edits in the same tick build on each other.
    filesRef.current = updated;
    setFilesState(updated);
    latest.current.onFilesChange?.(updated, key);
  }, []);

  const setFiles = useCallback((next: FilesRecord) => {
    filesRef.current = next;
    setFilesState(next);
    latest.current.onFilesChange?.(next, undefined);
  }, []);

  const setActiveFile = useCallback((file: string) => {
    if (latest.current.activeFile === undefined) setActiveInternal(file);
    latest.current.onActiveFileChange?.(file);
  }, []);

  const setCode = useCallback(
    (next: string) => {
      if (filesRef.current !== undefined) {
        const target = activeRef.current;
        if (target !== undefined) setFile(target, next);
        return;
      }
      setCodeState(next);
      latest.current.onCodeChange?.(next);
    },
    [setFile],
  );

  const project = useMemo<ProjectState | undefined>(
    () =>
      current
        ? {
            files: current,
            entry: entryKey ?? '',
            activeFile: activeKey ?? '',
            setActiveFile,
            setFile,
            setFiles,
          }
        : undefined,
    [current, entryKey, activeKey, setActiveFile, setFile, setFiles],
  );

  if (!project) return { code, setCode };
  return {
    code: activeKey !== undefined ? (current?.[activeKey] ?? '') : '',
    setCode,
    project,
  };
}
