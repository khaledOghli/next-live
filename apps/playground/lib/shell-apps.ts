/**
 * Production-shaped demo catalogue for /apps, separate from the /playground lab.
 */
export interface ShellApp {
  id: string;
  name: string;
  description: string;
  source: string;
}

export const shellApps: ShellApp[] = [
  {
    id: 'hooks-timer',
    name: 'Hooks: timer',
    description: 'useState + useEffect with interval cleanup.',
    source: `import { useState, useEffect } from 'react';

export default function Timer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="grid gap-2">
      <p className="text-2xl font-semibold tabular-nums">{seconds}s</p>
      <p className="text-sm text-muted-foreground">
        Interval started on mount; cleanup runs when you switch tabs.
      </p>
    </div>
  );
}
`,
  },
  {
    id: 'hooks-fetch',
    name: 'Hooks: fetch',
    description: 'useEffect async pattern with loading and error states.',
    source: `import { useState, useEffect } from 'react';

export default function FetchDemo() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(() => {
      if (cancelled) return;
      setStatus('ok');
      setMessage('Data loaded after simulated fetch');
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (status === 'loading') {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="grid gap-2">
      <p className="font-medium">{message}</p>
      <p className="text-sm text-muted-foreground">useEffect cleanup cancels in-flight work.</p>
    </div>
  );
}
`,
  },
  {
    id: 'ui-cards',
    name: 'UI: shadcn cards',
    description: 'Tailwind via @app/ui - classes compiled in the host, not the snippet.',
    source: `import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@app/ui';

export default function UiCards() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Registered UI</CardTitle>
          <Badge>live</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          This card uses shadcn components from @app/ui. Tailwind is applied
          through the host bundle, not compiled inside the snippet.
        </p>
        <Button type="button">Primary action</Button>
      </CardContent>
    </Card>
  );
}
`,
  },
  {
    id: 'host-imports',
    name: 'Host imports',
    description: 'Imports from @app/format and @app/store - host code outside next-live.',
    source: `import { formatMoney } from '@app/format';
import { useCart, addItem } from '@app/store';
import { Button } from '@app/ui';

export default function HostImports() {
  const items = useCart();
  const total = items.length * 9.99;

  return (
    <div className="grid max-w-sm gap-3">
      <p className="text-sm">
        Cart: {items.length} item(s) · {formatMoney(total)}
      </p>
      <Button type="button" onClick={() => addItem('Shell item ' + (items.length + 1))}>
        Add via @app/store
      </Button>
      <p className="text-xs text-muted-foreground">
        formatMoney comes from @app/format; the store is shared with the shell header.
      </p>
    </div>
  );
}
`,
  },
  {
    id: 'effects-props',
    name: 'Props + useEffect',
    description: 'useEffect reacts to live props passed from the shell.',
    source: `import { useState, useEffect } from 'react';
import { Badge } from '@app/ui';

export default function EffectsProps({ user }) {
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    setGreeting('Hello, ' + (user?.name ?? 'guest') + '!');
  }, [user?.name]);

  return (
    <div className="grid gap-2">
      <p className="text-lg font-medium">{greeting}</p>
      <Badge variant="secondary">props.user.name drives the effect</Badge>
    </div>
  );
}
`,
  },
];

export function getShellApp(id: string): ShellApp | undefined {
  return shellApps.find((app) => app.id === id);
}
