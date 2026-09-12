interface Step {
  title: string;
  children: React.ReactNode;
}

interface StepsProps {
  steps: Step[];
}

export function Steps({ steps }: StepsProps) {
  return (
    <ol className="my-6 grid gap-6">
      {steps.map((step, index) => (
        <li key={step.title} className="grid gap-2">
          <div className="flex items-center gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
              {index + 1}
            </span>
            <h3 className="text-base font-semibold">{step.title}</h3>
          </div>
          <div className="ml-10 text-muted-foreground [&_p]:mt-2">{step.children}</div>
        </li>
      ))}
    </ol>
  );
}
