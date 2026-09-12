const features = [
  {
    title: 'Real ESM imports',
    description:
      "Snippets use import and export default like real files, not a flat scope object of globals.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    title: 'SSR-safe by design',
    description:
      'Nothing compiles on the server. The first client render matches exactly, with no hydration errors.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
  {
    title: '~16 KB preview bundle',
    description:
      'Editor and transpiler are split out. Pages that only run snippets stay small.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    ),
  },
];

export function FeatureRow() {
  return (
    <div className="relative border-t border-border/40 bg-background/60 px-4 pb-20 pt-14 backdrop-blur-sm sm:px-6">
      <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-3 md:gap-8">
        {features.map((feature) => (
          <article key={feature.title} className="flex flex-col items-center text-center md:items-start md:text-left">
            <div className="flex size-12 items-center justify-center rounded-full bg-brand-muted text-brand">
              {feature.icon}
            </div>
            <h3 className="mt-4 text-base font-semibold">{feature.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
