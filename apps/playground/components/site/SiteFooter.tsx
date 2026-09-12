import Link from 'next/link';
import { RunnerLink } from '@/components/RunnerLink';
import { Logo } from './Logo';

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3">
        <div>
          <Logo asLink={false} className="text-lg" />
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Live TSX evaluation for React. MIT licensed.
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold">Documentation</p>
          <ul className="mt-4 grid gap-2.5 text-sm text-muted-foreground">
            <li>
              <RunnerLink href="/docs/getting-started" className="hover:text-brand">
                Getting started
              </RunnerLink>
            </li>
            <li>
              <RunnerLink href="/docs/security" className="hover:text-brand">
                Security
              </RunnerLink>
            </li>
            <li>
              <RunnerLink href="/docs/api-reference" className="hover:text-brand">
                API reference
              </RunnerLink>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold">Demos</p>
          <ul className="mt-4 grid gap-2.5 text-sm text-muted-foreground">
            <li>
              <RunnerLink href="/playground" className="hover:text-brand">
                Playground
              </RunnerLink>
            </li>
            <li>
              <RunnerLink href="/apps" className="hover:text-brand">
                Apps shell
              </RunnerLink>
            </li>
            <li>
              <Link href="https://www.npmjs.com/package/next-live" className="hover:text-brand">
                npm package
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} next-live. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="https://github.com/khaledoghli/next-live/blob/main/LICENSE" className="hover:text-foreground">
              License
            </a>
            <RunnerLink href="/docs/troubleshooting" className="hover:text-foreground">
              FAQ
            </RunnerLink>
          </div>
        </div>
      </div>
    </footer>
  );
}
