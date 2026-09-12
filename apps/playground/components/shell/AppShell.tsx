import type { ReactNode } from 'react';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { AppSidebar, type AppSidebarItem } from './AppSidebar';

interface AppShellProps {
  apps: AppSidebarItem[];
  activeId: string;
  onSelectApp: (id: string) => void;
  cartCount: number;
  children: ReactNode;
}

export function AppShell({
  apps,
  activeId,
  onSelectApp,
  cartCount,
  children,
}: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            next-live
          </Link>
          <Separator orientation="vertical" className="h-5" />
          <h1 className="text-sm font-semibold">Apps</h1>
          <Badge variant="secondary">shell demo</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Shared cart: <span className="font-medium text-foreground">{cartCount}</span> item(s)
        </p>
      </header>

      <div className="flex flex-1">
        <aside className="w-56 shrink-0 border-r border-border">
          <AppSidebar apps={apps} activeId={activeId} onSelect={onSelectApp} />
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
