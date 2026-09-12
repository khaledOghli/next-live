'use client';

import { cn } from '@/lib/utils';

export interface AppSidebarItem {
  id: string;
  name: string;
  description: string;
}

interface AppSidebarProps {
  apps: AppSidebarItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function AppSidebar({ apps, activeId, onSelect }: AppSidebarProps) {
  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Apps">
      {apps.map((app) => (
        <button
          key={app.id}
          type="button"
          onClick={() => onSelect(app.id)}
          aria-current={app.id === activeId ? 'page' : undefined}
          title={app.description}
          className={cn(
            'rounded-lg px-3 py-2 text-left text-sm transition-colors',
            app.id === activeId
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          <span className="font-medium">{app.name}</span>
        </button>
      ))}
    </nav>
  );
}
