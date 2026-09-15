import { describe, expect, it, vi } from 'vitest';
import { createConsoleStore } from '../src/console/createConsoleStore';
import type { ConsoleEntry } from '../src/core/types';

let id = 0;
const entry = (overrides: Partial<ConsoleEntry> = {}): ConsoleEntry => ({
  id: ++id,
  level: 'log',
  method: 'log',
  args: [],
  timestamp: 0,
  depth: 0,
  ...overrides,
});

describe('createConsoleStore', () => {
  it('appends entries and changes snapshot identity only on change', () => {
    const store = createConsoleStore();
    const empty = store.getSnapshot();
    expect(store.getSnapshot()).toBe(empty);

    const first = entry();
    store.push(first);
    expect(store.getSnapshot()).toEqual([first]);
    expect(store.getSnapshot()).not.toBe(empty);
  });

  it('drops the oldest entries past maxEntries', () => {
    const store = createConsoleStore({ maxEntries: 2 });
    const [a, b, c] = [entry(), entry(), entry()];
    store.push(a);
    store.push(b);
    store.push(c);
    expect(store.getSnapshot()).toEqual([b, c]);
  });

  it('clears on demand, and keeps a clear() call as a marker', () => {
    const store = createConsoleStore();
    store.push(entry());
    store.clear();
    expect(store.getSnapshot()).toEqual([]);

    store.push(entry());
    const marker = entry({ method: 'clear' });
    store.push(marker);
    expect(store.getSnapshot()).toEqual([marker]);
  });

  it('drops output from earlier compiles when a new one lands', () => {
    const store = createConsoleStore();
    const old = entry({ compileId: 1 });
    const fresh = entry({ compileId: 2 });
    store.push(old);
    store.push(fresh);
    store.compiled(2);
    expect(store.getSnapshot()).toEqual([fresh]);
  });

  it('still accepts late output from an old compile', () => {
    const store = createConsoleStore();
    store.compiled(3);
    const late = entry({ compileId: 1 });
    store.push(late);
    expect(store.getSnapshot()).toEqual([late]);
  });

  it('keeps everything when clearOnCompile is false', () => {
    const store = createConsoleStore({ clearOnCompile: false });
    const old = entry({ compileId: 1 });
    store.push(old);
    store.compiled(2);
    expect(store.getSnapshot()).toEqual([old]);
  });

  it('notifies subscribers, and stops after unsubscribe', () => {
    const store = createConsoleStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.push(entry());
    expect(listener).toHaveBeenCalledTimes(1);
    store.clear();
    store.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.push(entry());
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
