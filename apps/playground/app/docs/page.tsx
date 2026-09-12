import Link from 'next/link';
import type { Metadata } from 'next';
import { BrandWordmark } from '@/components/brand/BrandWordmark';
import { getDocGroups } from '@/lib/docs/nav';

export const metadata: Metadata = {
  title: 'Documentation',
  description:
    'Live TSX evaluation for React, real ESM imports, a module registry instead of a global scope, and zero hydration mismatches.',
  alternates: { canonical: '/docs' },
};

/** Short answers to the questions people arrive with, each pointing at the page that covers it. */
const FAQ = [
  {
    question: 'Does import work for any npm package?',
    answer: 'Only what you register. There is no npm in the browser.',
    href: '/docs/module-registry',
    label: 'Module registry',
  },
  {
    question: 'My app already uses the same library. Two copies?',
    answer: 'No, one instance, which is why a shared store really is shared.',
    href: '/docs/sharing-libraries',
    label: 'Sharing libraries',
  },
  {
    question: "Do I need 'unsafe-eval' in production?",
    answer: 'Yes, but scoped to the routes that run snippets, not your whole app.',
    href: '/docs/security',
    label: 'Security',
  },
  {
    question: 'Will this bloat my bundle?',
    answer: 'A preview-only page pays 16.1 KB. The editor and transpiler load separately.',
    href: '/docs/scaling',
    label: 'Scaling',
  },
  {
    question: 'Do I need next/dynamic with ssr: false?',
    answer: 'No. Nothing compiles during the server pass, so hydration cannot mismatch.',
    href: '/docs/getting-started#ssr-and-hydration',
    label: 'Getting started',
  },
  {
    question: 'Are TypeScript types checked?',
    answer: 'No, they are stripped, not verified.',
    href: '/docs/troubleshooting',
    label: 'Troubleshooting',
  },
];

const PATHS = [
  {
    title: 'New here',
    body: 'Install, render your first live snippet, then learn how imports resolve.',
    href: '/docs/getting-started',
    cta: 'Start the guide',
    featured: true,
  },
  {
    title: 'Adding this to a real app',
    body: 'End-to-end: snippets in a database, authored in a control panel.',
    href: '/docs/integration',
    cta: 'Integration guide',
  },
  {
    title: 'About to deploy',
    body: 'The trust model and the CSP you need. Ten minutes, and it matters.',
    href: '/docs/security',
    cta: 'Read security',
  },
  {
    title: 'Something is broken',
    body: 'Real error messages, each with the fix that resolves it.',
    href: '/docs/troubleshooting',
    cta: 'Troubleshooting',
  },
];

export default function DocsIndexPage() {
  const groups = getDocGroups();

  return (
    <div id="doc-article" className="pb-4">
      <header className="border-b border-border/40 pb-8">
        <h1 className="sr-only">next-live documentation</h1>
        <BrandWordmark priority />
      </header>

      {/* Entry points, ordered by what the reader is trying to do. */}
      <section className="mt-10" aria-labelledby="where-to-start">
        <h2 id="where-to-start" className="text-xl font-semibold tracking-tight text-foreground">
          Where to start
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {PATHS.map((path) => (
            <Link
              key={path.title}
              href={path.href}
              className={cardClass(path.featured)}
            >
              <h3 className="font-semibold text-foreground">{path.title}</h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
                {path.body}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand">
                {path.cta}
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-12" aria-labelledby="faq">
        <h2 id="faq" className="text-xl font-semibold tracking-tight text-foreground">
          Frequently asked
        </h2>
        <dl className="mt-4 divide-y divide-border rounded-xl border border-border">
          {FAQ.map((entry) => (
            <div key={entry.question} className="grid gap-1 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
              <div className="min-w-0">
                <dt className="font-medium text-foreground">{entry.question}</dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                  {entry.answer}
                </dd>
              </div>
              <Link
                href={entry.href}
                className="shrink-0 justify-self-start whitespace-nowrap rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand/30 hover:text-brand sm:justify-self-end"
              >
                {entry.label}
              </Link>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12" aria-labelledby="all-pages">
        <h2 id="all-pages" className="text-xl font-semibold tracking-tight text-foreground">
          All pages
        </h2>
        <div className="mt-4 grid gap-8 sm:grid-cols-3">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/80">
                {group.title}
              </p>
              <ul className="mt-3 space-y-3">
                {group.items.map((item) => (
                  <li key={item.slug}>
                    <Link href={`/docs/${item.slug}`} className="group block">
                      <span className="text-sm font-medium text-foreground group-hover:text-brand">
                        {item.title}
                      </span>
                      {item.description && (
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                          {item.description}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function cardClass(featured?: boolean): string {
  return [
    'group flex flex-col rounded-xl border p-5 transition-all hover:shadow-md',
    featured
      ? 'border-brand/30 bg-brand/5 hover:border-brand/50'
      : 'border-border bg-card hover:border-brand/30',
  ].join(' ');
}
