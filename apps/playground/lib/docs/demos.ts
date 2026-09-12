/** Central catalogue of live demo source strings for /docs pages. */

export const counterDemo = `import { useState } from 'react';

export default function Counter() {
  const [n, setN] = useState(0);
  return (
    <button
      type="button"
      onClick={() => setN(n + 1)}
      className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
    >
      clicked {n} times
    </button>
  );
}
`;

export const uiImportDemo = `import { useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@app/ui';

export default function UiDemo() {
  const [clicks, setClicks] = useState(0);

  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Module registry <Badge variant="secondary">@app/ui</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setClicks((n) => n + 1)}>
            Registered import works
          </Button>
          <Badge variant="outline">{clicks} clicks</Badge>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.5,
            color: 'var(--muted-foreground, #737373)',
          }}
        >
          {clicks === 0
            ? 'Click the button — shadcn Button + Badge from @app/ui (counter updates here).'
            : 'Clicked ' +
              clicks +
              (clicks === 1 ? ' time' : ' times') +
              ' — real Button from @app/ui'}
        </p>
      </CardContent>
    </Card>
  );
}
`;

export const storeDemo = `import { Button } from '@app/ui';
import { useCart, addItem } from '@app/store';

export default function CartDemo() {
  const cart = useCart();
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">
        Cart length: <strong>{cart.length}</strong> (shared with the host page)
      </p>
      <Button size="sm" onClick={() => addItem('doc-item')}>
        Add item
      </Button>
    </div>
  );
}
`;

export const formatDemo = `import { formatMoney } from '@app/format';

export default function FormatDemo() {
  return (
    <p className="text-lg font-semibold tabular-nums">
      {formatMoney(42.5)}
    </p>
  );
}
`;

export const nonUiDemo = `import { getCartCount, removeLastItem } from '@app/store';

export function run() {
  removeLastItem();
  return getCartCount();
}
`;

export const timerDemo = `import { useState, useEffect } from 'react';

export default function Timer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return <p className="text-2xl font-semibold tabular-nums">{seconds}s</p>;
}
`;

export const minimalPreviewDemo = `export default function Hello() {
  return <p className="text-sm">LivePreview renders this component.</p>;
}
`;

/**
 * Shows host → snippet data flow: `user` arrives through LiveProvider's
 * `props`, not through an import.
 */
export const propsDemo = `export default function Greeting({ user, plan }) {
  return (
    <div className="grid gap-1">
      <p className="text-sm">
        Signed in as <strong>{user.name}</strong>
      </p>
      <p className="text-xs text-muted-foreground">
        Plan: {plan}, passed in from the host page, not imported.
      </p>
    </div>
  );
}
`;

/** A snippet that throws on render, so <LiveError> has something to show. */
export const runtimeErrorDemo = `export default function Broken() {
  const items = null;
  // items is null, so .map throws while rendering.
  return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}
`;
