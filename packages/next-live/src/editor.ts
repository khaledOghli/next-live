'use client';

/**
 * The built-in code editor, on its own entry point.
 *
 * Kept out of the root entry deliberately. `<LiveEditor>` is the only thing
 * that needs `prism-react-renderer`, and a production page that merely *runs*
 * stored snippets never edits them. Measured: with the editor in the root
 * entry, a preview-only consumer paid 97.2 KB because the highlighter is not
 * tree-shaken away; separating it drops that to the library's own weight.
 *
 * ```ts
 * import { LiveProvider, LivePreview } from 'next-live';
 * import { LiveEditor } from 'next-live/editor';
 * ```
 *
 * `prism-react-renderer` is an optional peer dependency, so it is not even
 * installed unless you import this entry.
 */
export { LiveEditor } from './components/LiveEditor';
export type { LiveEditorProps, LiveEditorRenderProps } from './components/LiveEditor';
