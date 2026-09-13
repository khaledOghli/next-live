import React from 'react';
import StaticFenceNote from './StaticFenceNote';

export default function StaticFenceSection(): React.ReactElement {
  return (
    <section className="static-fence-section">
      <h2 className="static-fence-section__title">Static fence guards</h2>
      <p className="static-fence-section__desc">
        These examples prove quoted titles never accidentally enable live mode.
      </p>
      <StaticFenceNote />
    </section>
  );
}
