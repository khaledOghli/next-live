export function AccessDiagram() {
  const steps = [
    { role: 'Trusted author', action: 'Writes / saves snippet', detail: 'Admin, internal dev, your DB write API' },
    { role: 'Your API', action: 'Returns source string', detail: 'Authenticated, audited, versioned' },
    { role: 'LiveProvider', action: 'Compiles + runs on page', detail: 'Same origin, same cookies as the host' },
    { role: 'Visitor', action: 'Views preview', detail: 'Cannot inject code unless they control the write path' },
  ];

  return (
    <div className="my-6 grid gap-3">
      {steps.map((step, index) => (
        <div key={step.role} className="relative">
          <div className="flex items-start gap-4 rounded-xl border border-border bg-card p-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {index + 1}
            </span>
            <div>
              <p className="font-medium">{step.role}</p>
              <p className="text-sm text-foreground">{step.action}</p>
              <p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>
            </div>
          </div>
          {index < steps.length - 1 && (
            <div className="ml-4 h-3 border-l border-dashed border-border" aria-hidden />
          )}
        </div>
      ))}
    </div>
  );
}
