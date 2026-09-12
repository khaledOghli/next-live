'use client';

import { useState } from 'react';
import { useLiveModule } from 'next-live';
import { liveModules } from '@/lib/live-sdk';
import { nonUiDemo } from '@/lib/docs/demos';
import { Button } from '@/components/ui/button';

interface StoreScriptExports extends Record<string, unknown> {
  run?: () => number;
}

export function NonUiDemo() {
  const { exports, error, isCompiling } = useLiveModule<StoreScriptExports>({
    code: nonUiDemo,
    modules: liveModules,
  });
  const [lastCount, setLastCount] = useState<number | null>(null);
  const run = exports?.run;

  return (
    <div className="my-6 rounded-xl border border-border bg-card p-4">
      <p className="mb-3 text-sm font-medium">useLiveModule — non-UI snippet</p>
      {error && <p className="mb-2 text-xs text-destructive">{error.message}</p>}
      <Button
        type="button"
        size="sm"
        disabled={typeof run !== 'function' || isCompiling}
        onClick={() => {
          if (typeof run === 'function') setLastCount(run());
        }}
      >
        Run exported function
      </Button>
      {isCompiling && <span className="ml-2 text-xs text-muted-foreground">Compiling…</span>}
      {lastCount !== null && (
        <p className="mt-2 text-xs text-muted-foreground">Returned cart length: {lastCount}</p>
      )}
    </div>
  );
}
