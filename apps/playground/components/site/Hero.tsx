import { RunnerLink } from '@/components/RunnerLink';
import { FeatureRow } from './FeatureRow';
import { InstallPill } from './InstallPill';

export function Hero() {
  return (
    <section className="hero-gradient relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="hero-blob hero-blob-purple" />
        <div className="hero-blob hero-blob-blue" />
      </div>

      <div className="relative mx-auto max-w-5xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pb-20 sm:pt-24">
        <div className="mx-auto mb-8 flex size-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg shadow-brand/30">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
            <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
          </svg>
        </div>

        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl md:text-[3.25rem] md:leading-[1.15]">
          Build live previews with next-live
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Real ESM imports, a module registry instead of a scope bag, and zero hydration
          mismatches, built for the Next.js App Router.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <InstallPill className="shadow-sm" />
          <RunnerLink
            href="/docs/getting-started"
            className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground shadow-md shadow-brand/25 transition-opacity hover:opacity-90"
          >
            Documentation
            <span aria-hidden>→</span>
          </RunnerLink>
        </div>
      </div>

      <FeatureRow />
    </section>
  );
}
