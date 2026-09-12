/**
 * Stands in for the database behind a control panel.
 *
 * Each record is one app whose source was authored elsewhere and stored as
 * text. Nothing here is compiled at build time — the source travels to the
 * browser as a string and is compiled there, which is the whole point.
 */
export interface LiveApp {
  id: string;
  name: string;
  description: string;
  source: string;
}

export const apps: LiveApp[] = [
  {
    id: 'counter',
    name: 'Counter',
    description: 'React hooks imported with real ESM syntax.',
    source: `import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
      <p style={{ margin: 0, fontSize: 32, fontWeight: 600 }}>{count}</p>
      <button
        onClick={() => setCount((n) => n + 1)}
        style={{
          padding: '8px 16px',
          borderRadius: 8,
          border: '1px solid currentColor',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        Increment
      </button>
    </div>
  );
}
`,
  },
  {
    id: 'live-props',
    name: 'Live props',
    description: 'Deep subpath imports, and a live object passed by reference.',
    source: `import Widget from '@demo/vendor/Widget';
import formatCurrency from '@demo/vendor/format/currency';

interface Props {
  panel: { size: number; setSize: (n: number) => void };
  user: { name: string };
}

export default function LiveProps({ panel, user }: Props) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <strong>Hello {user.name}</strong>
      <p style={{ margin: 0, opacity: 0.7 }}>
        {String(new Widget({ label: 'panel' }))} · budget {formatCurrency(1250)}
      </p>
      <label style={{ display: 'grid', gap: 6 }}>
        Size: {panel.size}
        <input
          type="range"
          min={1}
          max={20}
          value={panel.size}
          onChange={(e) => panel.setSize(Number(e.target.value))}
        />
      </label>
      <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>
        Two deep subpaths resolved through one prefix entry. The slider updates
        the host page, because the object is passed by reference.
      </p>
    </div>
  );
}
`,
  },
  {
    id: 'store',
    name: 'Zustand store',
    description: 'Zustand cart shared across host, LivePreview, and an API script.',
    source: `import { useCart, addItem } from '@app/store';

export default function Cart() {
  const items = useCart();

  return (
    <div style={{ display: 'grid', gap: 10, justifyItems: 'start' }}>
      <p style={{ margin: 0 }}>
        {items.length === 0 ? 'Cart is empty' : \`\${items.length} item(s)\`}
      </p>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      <button
        onClick={() => addItem('Item ' + (items.length + 1))}
        style={{
          padding: '8px 16px',
          borderRadius: 8,
          border: '1px solid currentColor',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        Add item
      </button>
      <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>
        addItem runs here via @app/store. Clear cart is on the host panel;
        remove last runs from the API script below.
      </p>
    </div>
  );
}
`,
  },
  {
    id: 'heavy',
    name: 'Lazy heavy module',
    description: 'A large vendor module, fetched only when this app imports it.',
    source: `import { rows, count } from '@demo/vendor/heavy';

export default function Heavy() {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <strong>{count} rows loaded</strong>
      <p style={{ margin: 0, opacity: 0.7 }}>
        This module is not in the page bundle. It was downloaded as its own
        chunk the moment this snippet imported it.
      </p>
      <code style={{ fontSize: 12 }}>{rows[0].label} = {rows[0].value.toFixed(2)}</code>
    </div>
  );
}
`,
  },
  {
    id: 'shared-instance',
    name: 'Shared instance',
    description: 'Proves host and snippet hold the same module, not two copies.',
    source: `import Widget from '@demo/vendor/Widget';

// The host page imported this exact module too, and stamped it with __owner.
// Reading that marker here proves there is one instance, not two copies.
export default function SharedInstance() {
  const owner = Widget.__owner ?? '(marker missing — two separate copies!)';

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <strong>Widget.__owner = {String(owner)}</strong>
      <p style={{ margin: 0, opacity: 0.7 }}>
        The host statically imported '@demo/vendor/Widget'; this snippet imported
        the same specifier through the registry. One marker, one instance.
      </p>
      <p style={{ margin: 0, opacity: 0.7 }}>
        This is why a store shared with snippets is genuinely the same store.
      </p>
    </div>
  );
}
`,
  },
  {
    id: 'inline',
    name: 'Inline expression',
    description: 'No imports, no export — just an expression, like react-live.',
    source: `<div style={{ padding: 16, borderRadius: 8, background: '#0ea5e920' }}>
  A bare JSX expression is a valid snippet.
</div>
`,
  },
];

export function getApp(id: string): LiveApp | undefined {
  return apps.find((app) => app.id === id);
}
