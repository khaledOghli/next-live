import type { MDXComponents } from 'mdx/types';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children }) => (
      <h1 className="scroll-m-20 text-3xl font-semibold tracking-tight first:mt-0">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="scroll-m-20 border-b border-border pb-2 text-xl font-semibold tracking-tight mt-10 mb-4">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="scroll-m-20 text-lg font-semibold tracking-tight mt-8 mb-3">{children}</h3>
    ),
    p: ({ children }) => <p className="leading-7 text-muted-foreground [&:not(:first-child)]:mt-4">{children}</p>,
    ul: ({ children }) => <ul className="my-4 ml-6 list-disc text-muted-foreground [&>li]:mt-2">{children}</ul>,
    ol: ({ children }) => <ol className="my-4 ml-6 list-decimal text-muted-foreground [&>li]:mt-2">{children}</ol>,
    li: ({ children }) => <li className="leading-7">{children}</li>,
    a: ({ href, children }) => (
      <a href={href} className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80">
        {children}
      </a>
    ),
    code: ({ children }) => (
      <code className="relative rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">{children}</code>
    ),
    pre: ({ children }) => (
      <pre className="my-4 overflow-x-auto rounded-xl border border-border bg-muted/50 p-4 font-mono text-sm">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="my-6 w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-border bg-muted px-3 py-2 text-left font-medium">{children}</th>
    ),
    td: ({ children }) => <td className="border border-border px-3 py-2 text-muted-foreground">{children}</td>,
    blockquote: ({ children }) => (
      <blockquote className="mt-4 border-l-2 border-border pl-4 italic text-muted-foreground">{children}</blockquote>
    ),
    hr: () => <hr className="my-8 border-border" />,
    ...components,
  };
}
