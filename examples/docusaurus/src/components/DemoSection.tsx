import React, { type ReactNode } from 'react';

interface DemoSectionProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

export default function DemoSection({
  title,
  description,
  children,
}: DemoSectionProps): React.ReactElement {
  return (
    <section className="demo-section">
      <div className="demo-section__heading">
        <h2>{title}</h2>
      </div>
      {description ? <div className="demo-section__desc">{description}</div> : null}
      <div className="demo-section__content">{children}</div>
    </section>
  );
}
