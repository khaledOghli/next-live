import Link from 'next/link';

const cards = [
  {
    title: 'Installation',
    description: 'Install next-live and wire up your first LiveProvider in minutes.',
    href: '/docs/getting-started#step-1-install',
    cta: 'See guide',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
        <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      </svg>
    ),
  },
  {
    title: 'Module registry',
    description: 'Give snippets access to your app with defineLoader and a modules map.',
    href: '/docs/module-registry',
    cta: 'See page',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M3 9h18" />
        <path d="M9 21V9" />
      </svg>
    ),
  },
];

export function DocGuideCards() {
  return (
    <div className="not-prose mb-10 grid gap-4 sm:grid-cols-2">
      {cards.map((card) => (
        <Link
          key={card.title}
          href={card.href}
          className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-border hover:bg-muted/30"
        >
          <div className="flex size-10 items-center justify-center rounded-full bg-muted text-foreground">
            {card.icon}
          </div>
          <h3 className="mt-4 font-semibold text-foreground">{card.title}</h3>
          <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{card.description}</p>
          <span className="mt-4 text-sm font-medium text-brand group-hover:underline">{card.cta}</span>
        </Link>
      ))}
    </div>
  );
}
