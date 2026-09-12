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

  useEffect(() => {
    const article = document.getElementById('doc-article');
    if (!article) return;

    const headings = article.querySelectorAll('h2, h3');
    const toc: TocItem[] = [];

    headings.forEach((heading) => {
      if (heading.tagName !== 'H2' && heading.tagName !== 'H3') return;
      // `rehype-slug` assigns ids at build time, so they are already in the
      // served HTML and anchors work before hydration. A heading without one
      // cannot be linked to, so it is skipped rather than patched here.
      if (!heading.id) return;
      toc.push({
        id: heading.id,
        text: heading.textContent ?? '',
        level: heading.tagName === 'H2' ? 2 : 3,
      });
    });

    // The rule's premise - that an effect is the wrong place to derive state -
    // does not hold here: the headings only exist once the article has
    // rendered, so there is nothing to read at render time. One extra pass on
    // mount is the cost of reading the DOM at all.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(toc);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: [0, 1] },
    );

    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, []);

  if (items.length === 0) return null;

  return (
    <aside className="hidden w-56 shrink-0 xl:block">
      <nav aria-label="On this page" className="sticky top-8 py-10 pl-2 pr-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">On this page</p>
        <ul className="mt-4 space-y-2.5 text-sm">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={cn(
                  'block text-muted-foreground transition-colors hover:text-foreground',
                  item.level === 3 && 'pl-3 text-xs',
                  activeId === item.id && 'font-medium text-brand',
                )}
              >
                {item.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
