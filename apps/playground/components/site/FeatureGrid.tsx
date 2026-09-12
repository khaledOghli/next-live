const features = [
  {
    title: 'Module registry',
    description: 'Hand snippets your store, UI kit, and helpers via real import specifiers.',
    icon: '◈',
  },
  {
    title: 'Live props',
    description: 'Pass stores and objects by reference — mutations show up in your app immediately.',
    icon: '↔',
  },
  {
    title: 'CI validation',
    description: 'validateSnippets catches SDK renames before users open broken apps.',
    icon: '✓',
  },
  {
    title: 'Security model',
    description: 'Trust-based same-realm evaluation with route-scoped CSP guidance.',
    icon: '⛨',
  },
  {
    title: 'Non-UI snippets',
    description: 'useLiveModule runs validators, transformers, and config — not just components.',
    icon: '⚙',
  },
  {
    title: 'Server precompile',
    description: 'Skip the browser transpiler entirely for production at scale.',
    icon: '⚡',
  },
];

export function FeatureGrid() {
  return (
    <section className="section-padding border-t border-border bg-muted/20">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Features you&apos;ll love</h2>
          <p className="mt-4 text-muted-foreground">
            A documentation-ready library for embedded live tools, control panels, and app builders.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:border-brand/30 hover:shadow-md"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-brand-muted text-lg text-brand" aria-hidden>
                {feature.icon}
              </span>
              <h3 className="mt-4 font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
