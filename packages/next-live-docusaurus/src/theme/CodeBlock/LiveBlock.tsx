'use client';

import React from 'react';
import CodeBlock from '@theme-init/CodeBlock';
import { LiveProvider, LivePreview, LiveError } from 'next-live';
import { LiveEditor } from 'next-live/editor';
import { usePrismTheme } from '@docusaurus/theme-common';
import { MODULES_ID } from 'next-live-docusaurus/constants';

import * as liveModules from '@next-live-docusaurus/modules';

export interface LiveBlockProps {
  code: string;
  language: string;
  title?: string;
  showLineNumbers?: boolean;
  highlightLines?: string;
}

export default function LiveBlock({
  code,
  language,
  title,
  showLineNumbers,
  highlightLines,
}: LiveBlockProps): React.ReactElement {
  const prismTheme = usePrismTheme();

  return (
    <LiveProvider
      code={code}
      modules={{ [MODULES_ID]: liveModules }}
      language={language}
    >
      <div className="next-live-block" data-testid="next-live-block">
        {title ? (
          <div className="next-live-block__filename" data-testid="next-live-block-title">
            {title}
          </div>
        ) : null}
        <div className="next-live-block__body">
          <section className="next-live-block__pane next-live-block__preview-pane">
            <p className="next-live-block__pane-label">Preview</p>
            <div className="next-live-block__preview" data-testid="next-live-preview">
              <div className="next-live-block__preview-inner">
                <LivePreview fallback={<CodeBlock language={language}>{code}</CodeBlock>} />
              </div>
            </div>
            <LiveError className="next-live-block__error" as="div" />
          </section>
          <section className="next-live-block__pane next-live-block__editor-pane">
            <p className="next-live-block__pane-label">Source (editable)</p>
            <div className="next-live-block__editor">
              <LiveEditor
                theme={prismTheme}
                lineNumbers={showLineNumbers}
                highlightLines={highlightLines}
                className="next-live-editor-root"
              />
            </div>
          </section>
        </div>
      </div>
    </LiveProvider>
  );
}
