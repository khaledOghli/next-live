import React from 'react';

export default function DemoHero(): React.ReactElement {
  return (
    <header className="doc-hero">
      <h1 className="doc-hero__title">Docusaurus integration</h1>
      <p className="doc-hero__subtitle">
        Add live, editable TSX blocks to your documentation site. Readers edit the snippet; the
        preview recompiles in the browser. Same next-live engine as the{' '}
        <a href="https://next-live-playground.vercel.app/docs/docusaurus">playground docs</a>,
        delivered through a Docusaurus theme override.
      </p>
      <div className="doc-hero__badges">
        <span className="doc-badge doc-badge--brand">React 19</span>
        <span className="doc-badge">Docusaurus 3.7+</span>
        <span className="doc-badge">next-live 1.0</span>
      </div>
    </header>
  );
}
