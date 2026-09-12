'use client';

import { useCallback, useContext, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import type { Prism, PrismTheme } from 'prism-react-renderer';
import { errorPosition } from '../core/positions';
import { LiveContext } from '../context/LiveContext';

export interface LiveEditorRenderProps {
  code: string;
  onChange: (code: string) => void;
  language: string;
  error: Error | null;
  errorLine?: number;
  errorColumn?: number;
}

export interface LiveEditorProps {
  className?: string;
  style?: CSSProperties;
  theme?: PrismTheme;
  /** Read-only mode, for showing an app's source without allowing edits. */
  readOnly?: boolean;
  /** Spaces inserted by the Tab key. Default 2. */
  tabSize?: number;
  padding?: number;
  /** Paint-only highlight for the error line. Pass `null` to disable. */
  errorLineStyle?: CSSProperties | null;
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
}

const DEFAULT_ERROR_LINE_STYLE: CSSProperties = {
  background: 'rgba(179, 38, 30, 0.35)',
  boxShadow: 'inset 3px 0 0 #b3261e',
};

/**
 * Two pixels of high-contrast outline, offset so it reads against both the
 * editor background and the page behind it.
 */
const DEFAULT_FOCUS_RING_STYLE: CSSProperties = {
  outline: '2px solid #4d9fff',
  outlineOffset: '2px',
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
    'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  fontSize: '0.8125rem',
  lineHeight: 1.6,
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
  } = props;

  // Read the context directly rather than through `useLiveContext`, which
  // throws when there is no provider. Standalone rendering is supported, so
  // "no provider" is a valid state here rather than a mistake.
  const live = useContext(LiveContext);
  const highlightRef = useRef<HTMLPreElement>(null);
  const hintId = useId();

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

  if (codeProp === undefined && live === null) {
    throw new Error(
      '<LiveEditor> needs either a surrounding <LiveProvider> or a `code` prop. ' +
        'Pass `code` (and `onChange` to make it editable) to use it standalone.',
    );
  }

  const code = codeProp ?? live?.code ?? '';
  const language = languageProp ?? live?.language ?? 'tsx';
  const error = errorProp !== undefined ? errorProp : (live?.error ?? null);

  // An editor with nowhere to send an edit is read-only whether it says so or
  // not; making that explicit keeps the textarea's behaviour honest and stops
  // keystrokes being silently swallowed.
  const setCode = onChangeProp ?? (codeProp === undefined ? live?.setCode : undefined);
  const readOnly = readOnlyProp ?? setCode === undefined;

  const position = error ? errorPosition(error) : null;
  const errorLine = position?.line;
  const errorColumn = position?.column;

  const handleChange = useCallback(
    (value: string) => {
      setCode?.(value);
    },
    [setCode],
  );

  const renderProps: LiveEditorRenderProps = {
    code,
    onChange: handleChange,
    language,
    error,
    errorLine,
    errorColumn,
  };

  if (renderEditor) {
    return <>{renderEditor(renderProps)}</>;
  }

  // The highlighted layer does not scroll on its own - it is not focusable -
  // so it has to be driven from the textarea to stay aligned.
  const syncScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    const node = highlightRef.current;
    if (!node) return;
    node.scrollTop = event.currentTarget.scrollTop;
    node.scrollLeft = event.currentTarget.scrollLeft;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      // Arms the exit. Nothing is prevented: Escape has no meaning in a
      // textarea, but a dialog wrapping the editor may well want it.
      setTabEscapes(true);
      return;
    }

    if (event.key !== 'Tab') {
      // Any other key means the author kept typing, so re-arm indentation.
      // Modifier presses on their own are not "typing" and must not disarm the
      // exit - Shift+Tab fires a Shift keydown first, and disarming there
      // would make backwards escape impossible.
      if (!event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        if (tabEscapes) setTabEscapes(false);
      }
      return;
    }

    // Tab. Let it through when armed, or when there is nothing to edit.
    if (tabEscapes || readOnly) {
      setTabEscapes(false);
      return;
    }

    event.preventDefault();
    const target = event.currentTarget;
    const { selectionStart, selectionEnd, value } = target;
    const indent = ' '.repeat(tabSize);
    const next = value.slice(0, selectionStart) + indent + value.slice(selectionEnd);
    handleChange(next);
    requestAnimationFrame(() => {
      target.selectionStart = target.selectionEnd = selectionStart + indent.length;
    });
  };

  const layerStyle: CSSProperties = {
    ...SHARED_TEXT_STYLE,
    tabSize,
    padding,
    gridArea: '1 / 1',
    minWidth: 0,
    minHeight: 0,
    overflow: 'auto',
  };

  return (
    <div
      className={className}
      style={{
        // A single-cell grid makes both layers size to the larger of the two,
        // which absolute positioning cannot do without a fixed height.
        display: 'grid',
        position: 'relative',
        background: theme.plain.backgroundColor ?? '#1e1e1e',
        ...style,
        // The ring is painted on the wrapper rather than the textarea, whose
        // own outline would be clipped by its scroll box. Applied after the
        // caller's `style` so it is not accidentally overwritten.
        ...(focusRing && focusRingStyle ? focusRingStyle : null),
      }}
    >
      <Highlight prism={prism} code={code} language={language} theme={theme}>
        {({ style: prismStyle, tokens, getLineProps, getTokenProps }) => (
          <pre
            ref={highlightRef}
            aria-hidden="true"
            style={{ ...prismStyle, ...layerStyle }}
          >
            {tokens.map((line, i) => {
              const isErrorLine = errorLineStyle !== null && errorLine === i + 1;
              const lineProps = getLineProps({ line });
              return (
                // eslint-disable-next-line react/no-array-index-key
                <div
                  key={i}
                  {...lineProps}
                  className={[lineProps.className, isErrorLine ? errorLineClassName : undefined]
                    .filter(Boolean)
                    .join(' ')}
                  style={
                    isErrorLine
                      ? { ...lineProps.style, ...errorLineStyle }
                      : lineProps.style
                  }
                >
                  {line.map((token, key) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>

      <textarea
        value={code}
        onChange={(event) => handleChange(event.target.value)}
        onScroll={syncScroll}
        onKeyDown={handleKeyDown}
        onFocus={(event) => setFocusRing(prefersVisibleFocus(event.currentTarget))}
        onBlur={() => {
          setFocusRing(false);
          // Leaving and returning should not silently keep the exit armed.
          setTabEscapes(false);
        }}
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        aria-label={ariaLabel}
        aria-describedby={readOnly ? undefined : hintId}
        aria-keyshortcuts={readOnly ? undefined : 'Escape'}
        style={{
          ...layerStyle,
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
          Tab inserts spaces. Press Escape and then Tab to move focus out of the
          editor.
        </span>
      )}
    </div>
  );
}
