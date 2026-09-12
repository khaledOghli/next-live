'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

export function DocToc() {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const article = document.getElementById('doc-article');
    if (!article) return;

    const headings = Array.from(article.querySelectorAll<HTMLElement>('h2, h3')).filter(
      (heading) => heading.id,
    );

    // Reading the DOM is the only way to build this list: the headings come
    // from compiled MDX, so the shell has no data describing them. It runs once
    // on mount and the result is static, so the cascading-render concern the
    // rule guards against does not apply.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(
      headings.map((heading) => ({
        id: heading.id,
        // The heading contains a trailing "#" anchor link; strip it so the
        // entry reads as the section title rather than "Security#".
        text: (heading.firstChild?.textContent ?? heading.textContent ?? '').trim(),
        level: heading.tagName === 'H2' ? 2 : 3,
      })),
    );

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: [0, 1] },
    );
    headings.forEach((heading) => observer.observe(heading));

    // The article scrolls inside the shell's overflow container, not the
    // window, so progress is read from that element rather than scrollY.
    const scroller = article.closest<HTMLElement>('.overflow-y-auto');
    if (!scroller) return () => observer.disconnect();

    const onScroll = () => {
      const scrollable = scroller.scrollHeight - scroller.clientHeight;
      setProgress(scrollable <= 0 ? 1 : Math.min(1, scroller.scrollTop / scrollable));
    };
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', onScroll);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <aside className="hidden h-full w-60 shrink-0 overflow-y-auto overscroll-contain xl:block">
      <nav aria-label="On this page" className="py-10 pl-2 pr-8">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/80">
            On this page
          </p>
          <span className="text-[11px] tabular-nums text-muted-foreground/60">
            {Math.round(progress * 100)}%
          </span>
        </div>

        <div
          className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-border"
          role="presentation"
        >
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-150"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <ul className="mt-4 space-y-1 border-l border-border text-sm">
          {items.map((item) => {
            const active = activeId === item.id;
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={active ? 'location' : undefined}
                  className={cn(
                    '-ml-px block border-l py-1 pl-3 transition-colors',
                    item.level === 3 && 'pl-6 text-xs',
                    active
                      ? 'border-brand font-medium text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                  )}
                >
                  {item.text}
                </a>
              </li>
            );
          })}
        </ul>

        <a
          href="#doc-article"
          className="mt-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m18 15-6-6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to top
        </a>
      </nav>
    </aside>
  );
}
