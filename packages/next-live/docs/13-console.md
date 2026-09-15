# Showing console output

[← Docusaurus integration](./11-docusaurus.md) · [Docs index](./README.md) · [Multi-file snippets →](./14-multi-file.md)

When a snippet calls `console.log`, the message normally goes to the browser's
DevTools. The person editing the snippet may never open DevTools, and for a
snippet that renders nothing at all (a validator, a pricing rule, a data
transformer) the console is often the only feedback there is.

next-live can catch those calls and show them right next to the preview.

## Quick start

Add `<LiveConsole>` inside your provider. That is the whole setup.

```tsx
'use client';

import { LiveProvider, LivePreview, LiveError } from 'next-live';
import { LiveEditor } from 'next-live/editor';
import { LiveConsole } from 'next-live/console';

export function Playground({ source }: { source: string }) {
  return (
    <LiveProvider code={source}>
      <LiveEditor />
      <LivePreview />
      <LiveError />
      <LiveConsole />
    </LiveProvider>
  );
}
```

Try it with this snippet:

```tsx
const prices = [12, 30, 7];
console.log('Prices:', prices);
console.table(prices.map((price) => ({ price, withTax: price * 1.2 })));

export default function App() {
  console.info('Rendering App');
  return <p>Look at the console panel below the preview.</p>;
}
```

The panel shows three rows: the prices array, the table, and the message logged
while rendering.

The console lives on its own entry, `next-live/console`, so pages that never show
console output never download it.

## How capture gets switched on

Capture is **off** until something asks for it. Until then a snippet talks to the
browser's real `console`, exactly as it always has.

It switches on when either of these is true:

- a `<LiveConsole>` (or the `useLiveConsole` hook) is rendered inside the provider, or
- you pass an `onConsole` callback to `<LiveProvider>`, `useLiveRunner` or `useLiveModule`.

While capture is on, every call is **still passed on** to the browser console, so
DevTools keeps working as usual. If you want the browser console to stay quiet,
turn that off:

```tsx
<LiveProvider code={source} forwardConsole={false}>
```

> **Mount the panel together with the provider.** A panel that appears later, for
> example behind a "Console" tab, works too. The snippet just has to run once more
> so the console can be swapped in, which remounts the preview one time. Closing
> the panel afterwards does not switch capture off again, so it never costs a
> second remount.

## Styling the panel

`<LiveConsole>` ships without styles. Every row carries data attributes you can
target from CSS:

| Attribute | Where | Value |
|---|---|---|
| `data-next-live-console` | outer wrapper | always present |
| `data-level` | each row | `log`, `info`, `warn`, `error` or `debug` |
| `data-method` | each row | the method called, such as `table` or `assert` |
| `data-stale` | each row | present when the row came from code you have since replaced |
| `data-next-live-console-clear` | the clear button | always present |

A small starting point:

```css
[data-next-live-console] [role='log'] {
  max-height: 220px;
  overflow: auto;
  font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
}

[data-next-live-console] [data-level='warn'] {
  background: #fff8e1;
  color: #7a5b00;
}

[data-next-live-console] [data-level='error'] {
  background: #fdecea;
  color: #b3261e;
}

[data-next-live-console] [data-stale] {
  opacity: 0.5;
}
```

Rows inside `console.group()` are indented automatically.

## Props

| Prop | Type | Default | What it does |
|---|---|---|---|
| `levels` | `ConsoleLevel[]` | every level | Only show these levels, for example `['warn', 'error']`. |
| `maxEntries` | `number` | `500` | The oldest rows are dropped past this. |
| `clearOnCompile` | `boolean` | `true` | Clear output from the previous version of the code when a new version compiles, like DevTools does on reload. |
| `clearButton` | `boolean` | `true` | Show the built-in "Clear console" button. |
| `announce` | `boolean` | `false` | Read new output aloud to screen readers. Off by default, because a chatty snippet would talk over everything else. |
| `aria-label` | `string` | `'Console output'` | Accessible name of the log region. |
| `emptyState` | `ReactNode` | nothing | Shown while there is no output. |
| `renderEntry` | `(entry, info) => ReactNode` | text preview | Replaces the content of each row. |
| `children` | `(state) => ReactNode` | - | Replaces the whole panel. |
| `className`, `style` | | | Applied to the outer wrapper. |

### Custom rows

`renderEntry` receives the entry and a ready-made one-line `preview`. This row adds
a time stamp and, for multi-file snippets, where the call came from:

```tsx
<LiveConsole
  renderEntry={(entry, { preview }) => (
    <>
      <time>{new Date(entry.timestamp).toLocaleTimeString()}</time>{' '}
      {entry.file ? <code>{entry.file}:{entry.line}</code> : null} {preview}
    </>
  )}
/>
```

### A completely custom panel

Pass a function as `children` and draw everything yourself:

```tsx
<LiveConsole>
  {({ entries, clear }) => (
    <section>
      <header>
        {entries.length} messages <button onClick={clear}>Clear</button>
      </header>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id} className={entry.level}>
            {entry.method}
          </li>
        ))}
      </ul>
    </section>
  )}
</LiveConsole>
```

Or use the hook directly, which returns the same state:

```tsx
import { useLiveConsole } from 'next-live/console';

function ErrorCount() {
  const { entries } = useLiveConsole({ levels: ['error'] });
  return <span>{entries.length} errors</span>;
}
```

## Receiving entries yourself

When you want the data rather than a panel (to save it, send it to a test runner,
or count errors), pass `onConsole`:

```tsx
'use client';

import { useState } from 'react';
import { LiveProvider, LivePreview, type ConsoleEntry } from 'next-live';

export function RecordingPlayground({ source }: { source: string }) {
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);

  return (
    <LiveProvider code={source} onConsole={(entry) => setEntries((all) => [...all, entry])}>
      <LivePreview />
      <p>{entries.length} console calls so far</p>
    </LiveProvider>
  );
}
```

It is safe to set state inside `onConsole`. Entries are delivered in a small batch
right after the snippet logs, never in the middle of a React render.

Each entry looks like this:

| Field | Type | Meaning |
|---|---|---|
| `id` | `number` | Unique on the page. |
| `level` | `'log' \| 'info' \| 'warn' \| 'error' \| 'debug'` | What to style it as. |
| `method` | `string` | The method that was called: `log`, `table`, `assert`, `timeEnd` and so on. |
| `args` | `unknown[]` | The values passed, by reference. |
| `serialized` | `SerializedValue[]` | Set instead of `args` for entries from a sandboxed snippet. |
| `timestamp` | `number` | `Date.now()` at the time of the call. |
| `depth` | `number` | How many `console.group()` calls it is nested in. |
| `compileId` | `number` | The compile whose code made the call. |
| `file`, `line`, `column` | | Where the call was made, when it can be worked out. |

To turn an entry into text, use the same helpers the panel uses:

```ts
import { formatConsoleArgs, serializeValues } from 'next-live/console';

const text = formatConsoleArgs(entry.serialized ?? serializeValues(entry.args));
// 'Prices: [12, 30, 7]'
```

`formatConsoleArgs` understands `%s`, `%d`, `%i`, `%f`, `%o` and `%O` placeholders,
so `console.log('%s has %d items', 'cart', 3)` becomes `cart has 3 items`.

## Snippets that render nothing

Console output is most useful for [non-UI snippets](./09-non-ui-snippets.md).
`useLiveModule` takes `onConsole` too:

```tsx
'use client';

import { useState } from 'react';
import { useLiveModule } from 'next-live';
import { formatConsoleArgs, serializeValues } from 'next-live/console';

export function RuleTester({ source }: { source: string }) {
  const [lines, setLines] = useState<string[]>([]);

  const { exports, error } = useLiveModule({
    code: source,
    onConsole: (entry) =>
      setLines((current) => [...current, formatConsoleArgs(serializeValues(entry.args))]),
  });

  return (
    <div>
      {error ? <p role="alert">{error.message}</p> : null}
      <button onClick={() => (exports?.validate as (n: number) => boolean)?.(42)}>Run validate(42)</button>
      <pre>{lines.join('\n')}</pre>
    </div>
  );
}
```

Calls made later, from inside the exported functions, are captured too.

## Outside React

`compile` and `compileModule` accept the same option:

```ts
import { compileModule } from 'next-live';

const logs: unknown[][] = [];
const { exports } = await compileModule({
  code: source,
  onConsole: (entry) => logs.push([...entry.args]),
  forwardConsole: false,
});
```

Here the callback is called straight away, for every call.

## What is captured, and what is not

**Captured:** every call the snippet makes to `console`, including calls that happen
later from event handlers, timers and promises. That covers `log`, `info`, `warn`,
`error`, `debug`, `trace`, `table`, `dir`, `group`, `groupCollapsed`, `groupEnd`,
`time`, `timeLog`, `timeEnd`, `count`, `countReset`, `assert` and `clear`. Any other
method still works; it just goes straight to the browser console.

**Not captured:**

- **Calls through the global object**, such as `window.console.log(...)`. Capture
  replaces the `console` the snippet sees, not the one on `window`.
- **Logs from modules you registered.** Your UI kit or store logging something is
  your code, not the snippet's.
- **React's own warnings.** They are written by React, not by the snippet.

A few things behave in a way worth knowing:

- **`console.clear()`** clears the panel. It never clears the browser's DevTools.
- **Development mode renders twice.** Under React StrictMode, components render
  twice in development, so a log made while rendering shows up twice. DevTools
  shows the same thing.
- **Old code can still log.** If the previous version of a snippet started a timer,
  the timer can still fire after you edit. Those rows are kept and marked with
  `data-stale`, so you can dim them instead of losing them.

## Performance

Values are kept by reference and turned into text only when a row is actually
displayed, so capture is cheap even for large objects. The panel keeps the last
500 rows by default. Values are summarised past a depth of four and a hundred keys
or items, and a getter is listed, never called, so logging an object can never run
code by accident.

---

[← Docusaurus integration](./11-docusaurus.md) · [Docs index](./README.md) · [Multi-file snippets →](./14-multi-file.md)
