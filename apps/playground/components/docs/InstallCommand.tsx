'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeBlock } from './CodeBlock';

const MANAGERS = [
  { id: 'npm', command: 'npm install next-live' },
  { id: 'pnpm', command: 'pnpm add next-live' },
  { id: 'yarn', command: 'yarn add next-live' },
  { id: 'bun', command: 'bun add next-live' },
] as const;

interface InstallCommandProps {
  /** Override the package list, e.g. for the optional editor peer dependency. */
  packages?: string;
}

const INSTALL_VERB: Record<string, string> = {
  npm: 'npm install',
  pnpm: 'pnpm add',
  yarn: 'yarn add',
  bun: 'bun add',
};

export function InstallCommand({ packages }: InstallCommandProps) {
  return (
    <Tabs defaultValue="npm" className="my-6">
      <TabsList>
        {MANAGERS.map((manager) => (
          <TabsTrigger key={manager.id} value={manager.id}>
            {manager.id}
          </TabsTrigger>
        ))}
      </TabsList>
      {MANAGERS.map((manager) => (
        <TabsContent key={manager.id} value={manager.id}>
          <CodeBlock
            code={packages ? `${INSTALL_VERB[manager.id]} ${packages}` : manager.command}
            language="bash"
            variant="install"
            title="Terminal"
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
