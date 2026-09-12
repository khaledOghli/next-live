'use client';

import { useCallback, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import type { PrismTheme } from 'prism-react-renderer';
import { errorPosition } from '../core/positions';
import { useLiveContext } from '../hooks/useLiveContext';

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
   * Replaces the built-in editor entirely — drop in CodeMirror, Monaco, or
   * anything else while keeping the rest of the provider wiring.
   */
  renderEditor?: (props: LiveEditorRenderProps) => ReactNode;
}

const DEFAULT_ERROR_LINE_STYLE: CSSProperties = {
  background: 'rgba(179, 38, 30, 0.35)',
  boxShadow: 'inset 3px 0 0 #b3261e',
};

/**
 * Typography shared by the textarea and the highlighted layer beneath it.
 *
 * Every value here has to match in both layers or the visible text will drift
 * out of alignment with the caret — that is the whole difficulty of this
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

/**
 * A code editor built from a transparent `<textarea>` layered over syntax
 * highlighted output.
 *
 * There is no editor engine here by design — that keeps the bundle small and
 * sidesteps the SSR problems full editors bring. When a real editor is wanted,
 * pass `renderEditor`.
 */
export function LiveEditor(props: LiveEditorProps): ReactNode {
  const {
    className,
    style,
    theme = themes.vsDark,
    readOnly = false,
    tabSize = 2,
    padding = 16,
    errorLineStyle = DEFAULT_ERROR_LINE_STYLE,
    errorLineClassName,
    renderEditor,
  } = props;

  const live = useLiveContext();
  const highlightRef = useRef<HTMLPreElement>(null);
  const position = live.error ? errorPosition(live.error) : null;
  const errorLine = position?.line;
  const errorColumn = position?.column;

  const handleChange = useCallback(
    (value: string) => live.setCode(value),
    [live],
  );

  const renderProps: LiveEditorRenderProps = {
    code: live.code,
    onChange: handleChange,
    language: live.language,
    error: live.error,
    errorLine,
    errorColumn,
  };

  if (renderEditor) {
    return <>{renderEditor(renderProps)}</>;
  }

  // The highlighted layer does not scroll on its own — it is not focusable —
  // so it has to be driven from the textarea to stay aligned.
  const syncScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    const node = highlightRef.current;
    if (!node) return;
    node.scrollTop = event.currentTarget.scrollTop;
    node.scrollLeft = event.currentTarget.scrollLeft;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab' || readOnly) return;
    // Without this, Tab moves focus out of the editor, which is useless while
    // writing code. Escape then Tab still leaves, so keyboard users are not
    // trapped.
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
      }}
    >
      <Highlight code={live.code} language={live.language} theme={theme}>
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
        value={live.code}
        onChange={(event) => handleChange(event.target.value)}
        onScroll={syncScroll}
        onKeyDown={handleKeyDown}
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        aria-label="Live code editor"
        style={{
          ...layerStyle,
          resize: 'none',
          outline: 'none',
          background: 'transparent',
          // The text itself is invisible; only the highlighted layer is read.
          // The caret is painted separately so it stays visible.
          color: 'transparent',
          caretColor: theme.plain.color ?? '#fff',
        }}
      />
    </div>
  );
}
