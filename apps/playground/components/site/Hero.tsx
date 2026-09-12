import { BrandIcon } from '@/components/brand/BrandIcon';
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
        <div className="mx-auto mb-8 flex size-14 items-center justify-center">
          <BrandIcon size={56} />
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
