import { describe, expect, it, vi } from 'vitest';
import { compileModule } from '../src/core/compile';
import type { ConsoleEntry } from '../src/core/types';

/** A forward target that records calls, so tests never print. */
function fakeConsole() {
  const calls: Array<[string, unknown[]]> = [];
  const target = new Proxy(
    {},
    {
      get: (_target, method: string) =>
        (...args: unknown[]) => {
          calls.push([method, args]);
        },
    },
  );
  return { target, calls };
}

async function capture(code: string, extra: Parameters<typeof compileModule>[0] extends infer I ? Partial<I> : never = {}) {
  const entries: ConsoleEntry[] = [];
  const host = fakeConsole();
  const result = await compileModule({
    code,
    scope: { console: host.target },
    onConsole: (entry) => entries.push(entry),
    ...extra,
  });
  return { entries, calls: host.calls, result };
}

describe('console capture is opt-in', () => {
  it('leaves the real console in place without onConsole', async () => {
    const { exports } = await compileModule({ code: 'export default console === globalThis.console;' });
    expect(exports['default']).toBe(true);
  });

  it('still lets scope.console shadow the global without onConsole, as in 1.0', async () => {
    const custom = { log: vi.fn() };
    await compileModule({ code: 'console.log("hi"); export default 1;', scope: { console: custom } });
    expect(custom.log).toHaveBeenCalledWith('hi');
  });
});

describe('console capture', () => {
  it('records calls with level, method and the raw arguments', async () => {
    const payload = { id: 1 };
    const { entries } = await capture('console.warn("careful", data); export default 1;', {
      scope: { data: payload, console: fakeConsole().target },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: 'warn', method: 'warn', depth: 0 });
    expect(entries[0]?.args[1]).toBe(payload);
  });

  it('forwards to scope.console, which no longer collides with the injected parameter', async () => {
    const { calls } = await capture('console.log("a", 1); export default 1;');
    expect(calls).toEqual([['log', ['a', 1]]]);
  });

  it('forwards to nothing when forwardConsole is false', async () => {
    const { calls, entries } = await capture('console.log("quiet"); export default 1;', {
      forwardConsole: false,
    });
    expect(calls).toEqual([]);
    expect(entries).toHaveLength(1);
  });

  it('maps each call to the line that made it', async () => {
    const { entries } = await capture('const x = 1;\n\nconsole.log(x);\nexport default x;');
    expect(entries[0]).toMatchObject({ line: 3 });
  });

  it('tracks group depth', async () => {
    const { entries } = await capture(
      'console.group("g"); console.log("in"); console.groupEnd(); console.log("out"); export default 1;',
    );
    expect(entries.map((entry) => [entry.method, entry.depth])).toEqual([
      ['group', 0],
      ['log', 1],
      ['log', 0],
    ]);
  });

  it('turns timers and counters into readable entries', async () => {
    const { entries } = await capture(
      'console.time("t"); console.timeEnd("t"); console.timeEnd("t"); console.count(); console.count(); export default 1;',
    );
    expect(entries[0]).toMatchObject({ method: 'timeEnd', level: 'info' });
    expect(String(entries[0]?.args[0])).toMatch(/^t: [\d.]+ ms$/);
    expect(entries[1]).toMatchObject({ level: 'warn', args: ["Timer 't' does not exist"] });
    expect(entries.slice(2).map((entry) => entry.args[0])).toEqual(['default: 1', 'default: 2']);
  });

  it('records assert only when it fails', async () => {
    const { entries } = await capture('console.assert(true, "no"); console.assert(0, "yes"); export default 1;');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: 'error', args: ['Assertion failed:', 'yes'] });
  });

  it('records clear but never forwards it to the host console', async () => {
    const { entries, calls } = await capture('console.clear(); export default 1;');
    expect(entries.map((entry) => entry.method)).toEqual(['clear']);
    expect(calls).toEqual([]);
  });

  it('lets unknown methods fall through to the forward target', async () => {
    const custom = { log: vi.fn(), profileEnd: vi.fn() };
    await compileModule({
      code: 'console.profileEnd("p"); export default 1;',
      scope: { console: custom },
      onConsole: () => {},
    });
    expect(custom.profileEnd).toHaveBeenCalledWith('p');
  });

  it('never throws into the snippet when the sink throws', async () => {
    const { exports } = await compileModule({
      code: 'console.log("x"); export default "survived";',
      scope: { console: fakeConsole().target },
      onConsole: () => {
        throw new Error('sink broke');
      },
    });
    expect(exports['default']).toBe('survived');
  });

  it('captures calls made later, from callbacks the snippet scheduled', async () => {
    const entries: ConsoleEntry[] = [];
    await compileModule({
      code: 'setTimeout(() => console.info("later"), 0); export default 1;',
      scope: { console: fakeConsole().target },
      onConsole: (entry) => entries.push(entry),
    });
    expect(entries).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(entries.map((entry) => entry.args[0])).toEqual(['later']);
  });

  it('gives every entry a unique id', async () => {
    const { entries } = await capture('console.log(1); console.log(2); export default 1;');
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(2);
  });
});
