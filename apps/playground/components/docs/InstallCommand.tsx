'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeBlock } from './CodeBlock';

export function InstallCommand() {
  return (
    <Tabs defaultValue="npm" className="my-6">
      <TabsList>
        <TabsTrigger value="npm">npm</TabsTrigger>
        <TabsTrigger value="pnpm">pnpm</TabsTrigger>
        <TabsTrigger value="yarn">yarn</TabsTrigger>
      </TabsList>
      <TabsContent value="npm">
        <CodeBlock code="npm install next-live" language="bash" variant="install" />
      </TabsContent>
      <TabsContent value="pnpm">
        <CodeBlock code="pnpm add next-live" language="bash" variant="install" />
      </TabsContent>
      <TabsContent value="yarn">
        <CodeBlock code="yarn add next-live" language="bash" variant="install" />
      </TabsContent>
    </Tabs>
  );
}
