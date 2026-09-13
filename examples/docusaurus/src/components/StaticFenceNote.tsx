import React from 'react';

export default function StaticFenceNote(): React.ReactElement {
  return (
    <div className="static-fence-note" role="note">
      <p className="static-fence-note__title">Static fences stay static</p>
      <p className="static-fence-note__body">
        The word <code>live</code> inside a quoted <code>title=</code> must not activate live mode.
        The three blocks below are plain code, not editable previews.
      </p>
    </div>
  );
}
