'use client';

import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, ReactNode, Ref } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import type { Prism, PrismTheme } from 'prism-react-renderer';
import { errorPosition } from '../core/positions';
import { LiveContext } from '../context/LiveContext';
import type { FormatFn } from '../editor/format';
import { normalizeFormatResult } from '../editor/format';
import { parseLineRanges } from '../editor/lines';
import { readSelection, selectionsEqual, type EditorSelection } from '../editor/selection';
import {
  editLineIndent,
  insertNewline,
  replaceRange,
} from '../editor/text-edit';

export type { EditorSelection };

export interface LiveEditorHandle {
  focus: () => void;
  getSelection: () => EditorSelection | null;
  setSelection: (start: number, end?: number) => void;
  insertText: (text: string) => void;
  format: () => Promise<void>;
}

export interface EditorDiagnostic {
  line: number;
  column?: number;
  message: string;
  severity?: 'error' | 'warning';
}

export interface LiveEditorRenderProps {
  code: string;
  onChange: (code: string) => void;
  language: string;
  error: Error | null;
  errorLine?: number;
  errorColumn?: number;
  diagnostics?: readonly EditorDiagnostic[];
  /** Ref snapshot of the last known selection; may lag one frame behind the caret. */
  selection?: EditorSelection | null;
  onSelectionChange?: (sel: EditorSelection) => void;
}

export interface LiveEditorProps {
  className?: string;
  style?: CSSProperties;
  /** Prism theme for syntax highlighting. Default `themes.vsDark`. */
  theme?: PrismTheme;
  /** Read-only mode, for showing an app's source without allowing edits. */
  readOnly?: boolean;
  /** Spaces inserted by the Tab key. Default 2. */
  tabSize?: number;
  /** Inner padding in pixels. Default 16. Overridable via `--next-live-padding`. */
  padding?: number;
  /** Paint-only highlight for the error line. Pass `null` to disable. */
  errorLineStyle?: CSSProperties | null;
  /** Optional class name merged onto the error line in the highlight layer. */
  errorLineClassName?: string;
  /**
   * Standalone mode: the code to show, when there is no `<LiveProvider>`
   * above. Inside a provider this overrides the provider's code, which is
   * rarely what you want - omit it and let the context supply it.
   */
  code?: string;
  /**
   * Standalone mode: notified on every edit. Without it - and without a
   * provider to call `setCode` on - there is nothing to write an edit to, so
   * the editor renders read-only.
   */
  onChange?: (code: string) => void;
  /** Highlighting language. Defaults to the provider's, then `'tsx'`. */
  language?: string;
  /** Error to underline. Defaults to the provider's. */
  error?: Error | null;
  /**
   * A Prism instance with extra languages registered, for highlighting
   * anything outside `prism-react-renderer`'s built-in set.
   *
   * ```ts
   * import { Prism } from 'prism-react-renderer';
   * (globalThis as any).Prism = Prism;
   * await import('prismjs/components/prism-rust');
   * ```
   */
  prism?: typeof Prism;
  /**
   * Ring painted around the editor while it holds keyboard focus. Pass `null`
   * to disable - but then paint your own, or keyboard users cannot see where
   * they are (WCAG 2.4.7).
   */
  focusRingStyle?: CSSProperties | null;
  /** Overrides the default accessible name. */
  'aria-label'?: string;
  /**
   * Replaces the built-in editor entirely - drop in CodeMirror, Monaco, or
   * anything else while keeping the rest of the provider wiring.
   */
  renderEditor?: (props: LiveEditorRenderProps) => ReactNode;
  /** Preserve current line indent on Enter. Default true. */
  autoIndent?: boolean;
  /** 1-based lines to highlight, e.g. `1,3-5` or `[2,4]`. */
  highlightLines?: string | number | readonly number[];
  /** Inline style for `highlightLines` rows in the highlight layer. */
  highlightLineStyle?: CSSProperties;
  /** Class name for `highlightLines` rows in the highlight layer. */
  highlightLineClassName?: string;
  /** Show a line-number gutter. Does not combine cleanly with `wrap`. */
  lineNumbers?: boolean;
  /** Soft-wrap long lines. */
  wrap?: boolean;
  /** Editor diagnostics shown inline and below the editor. */
  diagnostics?: readonly EditorDiagnostic[];
  /** Fired when the caret or selection range changes inside the textarea. */
  onSelectionChange?: (sel: EditorSelection) => void;
  /** Async formatter (see `next-live/prettier`). */
  format?: FormatFn;
  /** Run `format` when the editor blurs. Default false. */
  formatOnBlur?: boolean;
  /** Called when `format` rejects; defaults to `console.warn` in development. */
  onFormatError?: (error: Error) => void;
  /** Screen-reader announcements for compile errors from `<LiveProvider>`. Default false. */
  announceErrors?: boolean;
  /** Imperative handle: focus, selection, insertText, format. */
  ref?: Ref<LiveEditorHandle>;
}

/** Default red wash for the compile-error line in the highlight layer. */
const DEFAULT_ERROR_LINE_STYLE: CSSProperties = {
  background: 'rgba(179, 38, 30, 0.35)',
  boxShadow: 'inset 3px 0 0 #b3261e',
};

const DEFAULT_HIGHLIGHT_LINE_STYLE: CSSProperties = {
  background: 'rgba(77, 159, 255, 0.15)',
};

/**
 * Two pixels of high-contrast outline, offset so it reads against both the
 * editor background and the page behind it.
 */
const DEFAULT_FOCUS_RING_STYLE: CSSProperties = {
  outline: '2px solid #4d9fff',
  outlineOffset: '2px',
};

const DIAGNOSTIC_ERROR_STYLE: CSSProperties = {
  boxShadow: 'inset 0 -2px 0 #b3261e',
};

const DIAGNOSTIC_WARNING_STYLE: CSSProperties = {
  boxShadow: 'inset 0 -2px 0 #e6a700',
};

/**
 * Typography shared by the textarea and the highlighted layer beneath it.
 *
 * Every value here has to match in both layers or the visible text will drift
 * out of alignment with the caret - that is the whole difficulty of this
 * technique, so the styles live in one object rather than being repeated.
 */
const SHARED_TEXT_STYLE: CSSProperties = {
  margin: 0,
  border: 0,
  fontFamily:
    'var(--next-live-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace)',
  fontSize: 'var(--next-live-font-size, 0.8125rem)',
  lineHeight: 'var(--next-live-line-height, 1.6)',
  fontVariantLigatures: 'none',
  tabSize: 2,
  whiteSpace: 'pre',
  wordBreak: 'normal',
  overflowWrap: 'normal',
};

/** Hides the focus hint from sight while leaving it on the accessibility tree. */
const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * `:focus-visible` is what decides whether a focus ring should be painted, but
 * it can only be asked of a live element - and jsdom, plus a few older
 * engines, do not implement it. Treating an unanswerable question as "yes"
 * fails safe: a ring that shows after a mouse click is a cosmetic complaint,
 * a ring that never shows is an accessibility defect.
 */
function prefersVisibleFocus(element: HTMLElement): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    return true;
  }
}

const PURE_MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

function isApplePlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
}

function isMod(event: React.KeyboardEvent): boolean {
  if (event.altKey) return false;
  return isApplePlatform() ? event.metaKey : event.ctrlKey;
}

function isConnected(el: HTMLTextAreaElement | null): el is HTMLTextAreaElement {
  return el !== null && el.isConnected;
}

/**
 * A code editor built from a transparent `<textarea>` layered over syntax
 * highlighted output.
 *
 * There is no editor engine here by design - that keeps the bundle small and
 * sidesteps the SSR problems full editors bring. When a real editor is wanted,
 * pass `renderEditor`.
 *
 * Usually rendered inside a `<LiveProvider>`, which supplies the code and
 * receives the edits. It also works standalone - pass `code`, and `onChange`
 * if it should be editable - which is how a page shows a highlighted,
 * read-only snippet without spinning up a provider to run it.
 */
export function LiveEditor(props: LiveEditorProps): ReactNode {
  const {
    className,
    style,
    theme = themes.vsDark,
    readOnly: readOnlyProp,
    tabSize = 2,
    padding = 16,
    errorLineStyle = DEFAULT_ERROR_LINE_STYLE,
    errorLineClassName,
    code: codeProp,
    onChange: onChangeProp,
    language: languageProp,
    error: errorProp,
    prism,
    focusRingStyle = DEFAULT_FOCUS_RING_STYLE,
    'aria-label': ariaLabel = 'Live code editor',
    renderEditor,
    autoIndent = true,
    highlightLines,
    highlightLineStyle = DEFAULT_HIGHLIGHT_LINE_STYLE,
    highlightLineClassName,
    lineNumbers = false,
    wrap = false,
    diagnostics,
    onSelectionChange,
    format,
    formatOnBlur = false,
    onFormatError,
    announceErrors = false,
    ref: handleRef,
  } = props;

  // Read the context directly rather than through `useLiveContext`, which
  // throws when there is no provider. Standalone rendering is supported.
  const live = useContext(LiveContext);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLPreElement>(null);
  const hintId = useId();
  const liveId = useId();
  const formatGenRef = useRef(0);
  const lastSelectionRef = useRef<EditorSelection | null>(null);

  /**
   * Set by Escape, cleared by anything else. While set, Tab moves focus
   * instead of indenting.
   *
   * A code editor has to swallow Tab to be usable, and swallowing Tab with no
   * way out is a keyboard trap - WCAG 2.1.2, a Level A failure. Escape-then-Tab
   * is the convention CodeMirror and Monaco use, and `aria-describedby` below
   * announces it, which 2.1.2 requires whenever the escape is non-obvious.
   */
  const [tabEscapes, setTabEscapes] = useState(false);
  const [focusRing, setFocusRing] = useState(false);
  const [announcedError, setAnnouncedError] = useState('');

  const code = codeProp ?? live?.code ?? '';
  const language = languageProp ?? live?.language ?? 'tsx';
  const error = errorProp !== undefined ? errorProp : (live?.error ?? null);
  const formatErrorMessage = live?.formatError;

  // An editor with nowhere to send an edit is read-only whether it says so or
  // not; making that explicit keeps the textarea's behaviour honest and stops
  // keystrokes being silently swallowed.
  const setCode = onChangeProp ?? (codeProp === undefined ? live?.setCode : undefined);
  const readOnly = readOnlyProp ?? setCode === undefined;

  const position = error ? errorPosition(error) : null;
  const errorLine = position?.line;
  const errorColumn = position?.column;

  const highlightedSet = useMemo(
    () => (highlightLines !== undefined ? parseLineRanges(highlightLines) : new Set<number>()),
    [highlightLines],
  );

  const diagnosticByLine = useMemo(() => {
    const map = new Map<number, EditorDiagnostic>();
    for (const d of diagnostics ?? []) {
      if (!map.has(d.line)) map.set(d.line, d);
    }
    return map;
  }, [diagnostics]);

  const handleChange = useCallback(
    (value: string) => {
      setCode?.(value);
    },
    [setCode],
  );

  const emitSelection = useCallback(
    (textarea: HTMLTextAreaElement) => {
      if (!onSelectionChange) return;
      const sel = readSelection(textarea);
      if (selectionsEqual(lastSelectionRef.current, sel)) return;
      lastSelectionRef.current = sel;
      onSelectionChange(sel);
    },
    [onSelectionChange],
  );

  const runFormat = useCallback(async () => {
    if (!format || readOnly || !setCode) return;
    const textarea = textareaRef.current;
    if (!isConnected(textarea)) return;

    const gen = ++formatGenRef.current;
    const snapshot = textarea.value;
    const cursorOffset = textarea.selectionStart;

    try {
      const raw = await format(snapshot, { language, cursorOffset });
      if (gen !== formatGenRef.current) return;
      if (!isConnected(textarea)) return;
      if (textarea.value !== snapshot) return;

      const { code: formatted, cursorOffset: nextCursor } = normalizeFormatResult(raw, cursorOffset);

      if (formatted === snapshot) return;

      replaceRange(textarea, 0, snapshot.length, formatted, nextCursor);
    } catch (cause) {
      const err = cause instanceof Error ? cause : new Error(String(cause));
      onFormatError?.(err);
      if (!onFormatError && process.env.NODE_ENV !== 'production') {
        console.warn('[next-live] format failed:', err);
      }
    }
  }, [format, readOnly, setCode, language, onFormatError]);

  useImperativeHandle(
    handleRef,
    () => ({
      focus: () => textareaRef.current?.focus(),
      getSelection: () =>
        textareaRef.current ? readSelection(textareaRef.current) : null,
      setSelection: (start, end = start) => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(start, end);
        emitSelection(el);
      },
      insertText: (text) => {
        const el = textareaRef.current;
        if (!el || readOnly) return;
        const { selectionStart, selectionEnd } = el;
        replaceRange(el, selectionStart, selectionEnd, text);
        emitSelection(el);
      },
      format: runFormat,
    }),
    [emitSelection, readOnly, runFormat],
  );

  const errorMessage =
    error && formatErrorMessage
      ? formatErrorMessage(error, { line: errorLine, column: errorColumn })
      : error?.message;

  useEffect(() => {
    if (!announceErrors) {
      setAnnouncedError('');
      return;
    }
    if (!errorMessage) {
      setAnnouncedError('');
      return;
    }
    setAnnouncedError('');
    const frame = requestAnimationFrame(() => setAnnouncedError(errorMessage));
    return () => cancelAnimationFrame(frame);
  }, [announceErrors, errorMessage]);

  const gutterLines = useMemo(() => {
    const lineCount = code.split('\n').length;
    return Array.from({ length: lineCount }, (_, i) => i + 1);
  }, [code]);

  if (codeProp === undefined && live === null) {
    throw new Error(
      '<LiveEditor> needs either a surrounding <LiveProvider> or a `code` prop. ' +
        'Pass `code` (and `onChange` to make it editable) to use it standalone.',
    );
  }

  const renderProps: LiveEditorRenderProps = {
    code,
    onChange: handleChange,
    language,
    error,
    errorLine,
    errorColumn,
    diagnostics,
    selection: lastSelectionRef.current,
    onSelectionChange,
  };

  if (renderEditor) {
    return <>{renderEditor(renderProps)}</>;
  }

  // The highlighted layer does not scroll on its own - it is not focusable -
  // so it has to be driven from the textarea to stay aligned.
  const syncScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    const top = event.currentTarget.scrollTop;
    const left = event.currentTarget.scrollLeft;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = top;
      highlightRef.current.scrollLeft = left;
    }
    // Line-number gutter scrolls in sync with the code column.
    if (gutterRef.current) {
      gutterRef.current.scrollTop = top;
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;

    const target = event.currentTarget;

    if (event.key === 'Escape') {
      // Arms the exit. Nothing is prevented: Escape has no meaning in a
      // textarea, but a dialog wrapping the editor may well want it.
      setTabEscapes(true);
      return;
    }

    // Any other key means the author kept typing, so re-arm indentation.
    // Modifier presses on their own are not "typing" and must not disarm the
    // exit - Shift+Tab fires a Shift keydown first, and disarming there
    // would make backwards escape impossible.
    if (
      tabEscapes &&
      event.key !== 'Tab' &&
      !PURE_MODIFIER_KEYS.has(event.key)
    ) {
      setTabEscapes(false);
    }

    if (
      event.key === 'Enter' &&
      !readOnly &&
      autoIndent &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event.nativeEvent.keyCode !== 229
    ) {
      event.preventDefault();
      const edit = insertNewline(
        target.value,
        target.selectionStart,
        target.selectionEnd,
        true,
      );
      replaceRange(target, edit.blockStart, edit.blockEnd, edit.replacement, edit.selectionEnd);
      emitSelection(target);
      return;
    }

    // Shift+Alt+F runs format when a formatter hook is provided.
    if (format && event.code === 'KeyF' && event.shiftKey && event.altKey && !readOnly) {
      event.preventDefault();
      void runFormat();
      return;
    }

    if (isMod(event) && (event.key === '[' || event.key === ']') && !readOnly) {
      event.preventDefault();
      const indent = ' '.repeat(tabSize);
      const add = event.key === ']';
      const edit = editLineIndent(
        target.value,
        target.selectionStart,
        target.selectionEnd,
        indent,
        add,
      );
      replaceRange(target, edit.blockStart, edit.blockEnd, edit.replacement, {
        select: [edit.selectionStart, edit.selectionEnd],
      });
      emitSelection(target);
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    // Tab. Let it through when armed, or when there is nothing to edit.
    if (tabEscapes || readOnly) {
      setTabEscapes(false);
      return;
    }

    event.preventDefault();
    const { selectionStart, selectionEnd, value } = target;
    const indent = ' '.repeat(tabSize);

    if (selectionStart !== selectionEnd) {
      const edit = editLineIndent(value, selectionStart, selectionEnd, indent, true);
      replaceRange(target, edit.blockStart, edit.blockEnd, edit.replacement, {
        select: [edit.selectionStart, edit.selectionEnd],
      });
      emitSelection(target);
      return;
    }

    replaceRange(target, selectionStart, selectionEnd, indent);
    emitSelection(target);
  };

  const whiteSpace = wrap ? 'pre-wrap' : 'pre';
  const pad = `var(--next-live-padding, ${padding}px)`;
  const codeColumn = lineNumbers ? 2 : 1;

  // Shared by the highlight pre and the textarea so caret and tokens stay aligned.
  const codeLayerStyle: CSSProperties = {
    ...SHARED_TEXT_STYLE,
    tabSize,
    padding: pad,
    whiteSpace,
    gridColumn: codeColumn,
    gridRow: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'auto',
  };

  const gutterColor =
    'var(--next-live-gutter-color, color-mix(in srgb, var(--next-live-code-color, currentColor) 35%, transparent))';

  const keyShortcuts = readOnly ? undefined : format ? 'Escape;Shift+Alt+F' : 'Escape';

  const hintText = format
    ? 'Tab inserts spaces. Press Escape and then Tab to move focus out of the editor. Shift+Alt+F formats.'
    : 'Tab inserts spaces. Press Escape and then Tab to move focus out of the editor.';

  return (
    <div
      className={className}
      style={{
        // A single grid makes both layers size together; className/style land
        // here so fixed heights and theme overrides behave like 0.1.0.
        display: 'grid',
        gridTemplateColumns: lineNumbers ? 'auto 1fr' : '1fr',
        position: 'relative',
        background: theme.plain.backgroundColor ?? '#1e1e1e',
        ['--next-live-code-color' as string]: theme.plain.color ?? '#fff',
        ...style,
        // The ring is painted on the wrapper rather than the textarea, whose
        // own outline would be clipped by its scroll box. Applied after the
        // caller's `style` so it is not accidentally overwritten.
        ...(focusRing && focusRingStyle ? focusRingStyle : null),
      }}
    >
        {lineNumbers && (
          <pre
            ref={gutterRef}
            aria-hidden="true"
            style={{
              ...SHARED_TEXT_STYLE,
              tabSize,
              gridColumn: 1,
              gridRow: 1,
              padding: `${pad} 0.5rem ${pad} ${pad}`,
              whiteSpace,
              color: gutterColor,
              userSelect: 'none',
              pointerEvents: 'none',
              overflow: 'hidden',
              textAlign: 'right',
              minWidth: '2.5rem',
            }}
          >
            {gutterLines.map((n) => (
              <div key={n}>{n}</div>
            ))}
          </pre>
        )}

        <Highlight prism={prism} code={code} language={language} theme={theme}>
          {({ style: prismStyle, tokens, getLineProps, getTokenProps }) => (
            <pre
              ref={highlightRef}
              aria-hidden="true"
              style={{ ...prismStyle, ...codeLayerStyle }}
            >
              {tokens.map((line, i) => {
                const lineNo = i + 1;
                const isErrorLine = errorLineStyle !== null && errorLine === lineNo;
                const isHighlighted = highlightedSet.has(lineNo);
                const diag = diagnosticByLine.get(lineNo);
                const lineProps = getLineProps({ line });
                const diagStyle =
                  diag?.severity === 'warning' ? DIAGNOSTIC_WARNING_STYLE : DIAGNOSTIC_ERROR_STYLE;
                return (
                  <div
                    key={i}
                    {...lineProps}
                    className={[
                      lineProps.className,
                      isErrorLine ? errorLineClassName : undefined,
                      !isErrorLine && isHighlighted ? highlightLineClassName : undefined,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={
                      isErrorLine
                        ? { ...lineProps.style, ...errorLineStyle }
                        : !isErrorLine && isHighlighted
                          ? { ...lineProps.style, ...highlightLineStyle }
                          : diag
                            ? { ...lineProps.style, ...diagStyle }
                            : lineProps.style
                    }
                  >
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })} />
                    ))}
                  </div>
                );
              })}
            </pre>
          )}
        </Highlight>

        <textarea
          ref={textareaRef}
          value={code}
          onChange={(event) => {
            handleChange(event.target.value);
            emitSelection(event.currentTarget);
          }}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          onSelect={(event) => emitSelection(event.currentTarget)}
          onKeyUp={(event) => emitSelection(event.currentTarget)}
          onMouseUp={(event) => emitSelection(event.currentTarget)}
          onBlur={() => {
            setFocusRing(false);
            // Leaving and returning should not silently keep the exit armed.
            setTabEscapes(false);
            if (formatOnBlur && format) void runFormat();
          }}
          onFocus={(event) => setFocusRing(prefersVisibleFocus(event.currentTarget))}
          readOnly={readOnly}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          aria-label={ariaLabel}
          aria-describedby={readOnly ? undefined : hintId}
          aria-keyshortcuts={keyShortcuts}
          style={{
            ...codeLayerStyle,
            resize: 'none',
            // The wrapper paints the ring instead - see above.
            outline: 'none',
            background: 'transparent',
            // The text itself is invisible; only the highlighted layer is read.
            // The caret is painted separately so it stays visible.
            color: 'transparent',
            caretColor: theme.plain.color ?? '#fff',
          }}
        />

        {!readOnly && (
          <span id={hintId} style={VISUALLY_HIDDEN}>
            {hintText}
          </span>
        )}

        {announceErrors && (
          <span id={liveId} style={VISUALLY_HIDDEN} aria-live="polite">
            {announcedError}
          </span>
        )}

        {(diagnostics?.length ?? 0) > 0 && (
          <ul
            role="status"
            aria-live="polite"
            style={{
              gridRow: 2,
              gridColumn: '1 / -1',
              margin: '0.25rem 0 0',
              padding: '0.5rem 0.75rem',
              listStyle: 'none',
              fontFamily: SHARED_TEXT_STYLE.fontFamily,
              fontSize: '0.75rem',
              lineHeight: 1.4,
              color: theme.plain.color ?? '#ccc',
              background: theme.plain.backgroundColor ?? '#1e1e1e',
            }}
          >
            {diagnostics!.map((d, i) => (
              <li key={`${d.line}-${i}`}>
                Line {d.line}
                {d.column !== undefined ? `:${d.column}` : ''} - {d.message}
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
