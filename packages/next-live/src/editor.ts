'use client';

/**
 * The built-in code editor, on its own entry point.
 *
 * Kept out of the root entry deliberately. `<LiveEditor>` is the only thing
 * that needs `prism-react-renderer`, and a production page that merely *runs*
 * stored snippets never edits them.
 */
export { LiveEditor } from './components/LiveEditor';
export type {
  LiveEditorProps,
  LiveEditorRenderProps,
  LiveEditorHandle,
  EditorSelection,
  EditorDiagnostic,
} from './components/LiveEditor';
// The `format` prop's contract, so a host can type its own formatter.
export type { FormatContext, FormatFn, FormatResult } from './editor/format';
