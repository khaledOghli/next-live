import { RunnerLink } from '@/components/RunnerLink';
import { counterDemo } from '@/lib/docs/demos';
import { BrowserFrame } from './BrowserFrame';

export function ShowcaseSection() {
  return (
    <section className="section-padding">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="inline-flex rounded-full bg-brand-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand">
            Live preview
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Run live TSX in your app efficiently
          </h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            Pass a string of TSX to LiveProvider, register your modules, and render with
            LivePreview. Snippets share your React instance and your live objects.
          </p>
          <RunnerLink
            href="/docs/getting-started"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground hover:opacity-90"
          >
            Read docs
            <span aria-hidden>→</span>
          </RunnerLink>
        </div>

        <BrowserFrame title="Counter.tsx" badge="Live TSX">
          <pre className="whitespace-pre-wrap">{counterDemo.trim()}</pre>
        </BrowserFrame>
      </div>
    </section>
  );
}
