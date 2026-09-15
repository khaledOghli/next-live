import type { ConsoleEntry, ConsoleLevel, ConsoleMethod } from './types';

export interface ConsoleSessionOptions {
  /** Receives every captured call. A throwing sink is swallowed. */
  emit: (entry: ConsoleEntry) => void;
  /**
   * Where calls are forwarded so they still reach DevTools. `false` captures
   * without printing. Defaults to the real `console`.
   */
  forward?: object | false;
  /** Maps the stack of a console call to the snippet position that made it. */
  locate?: (stack: string | undefined) => { line: number; column?: number } | null;
}

export interface ConsoleSession {
  /**
   * A `console` stand-in for one file. Proxies share timers, counters and group
   * depth, so `console.time()` in one file pairs with `timeEnd()` in another.
   */
  proxyFor(file?: string): Console;
}

let nextEntryId = 0;

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

/**
 * Creates the object injected as `console` into a snippet while capture is on.
 *
 * Deliberately not an ES `Proxy`: a plain object whose prototype is the forward
 * target already lets unknown methods (`profile`, `timeStamp`) fall through to
 * the real console, and costs nothing per call.
 */
export function createConsoleSession(options: ConsoleSessionOptions): ConsoleSession {
  const { emit, locate } = options;
  const target: object | undefined =
    options.forward === false ? undefined : (options.forward ?? globalThis.console);

  let depth = 0;
  const timers = new Map<string, number>();
  const counts = new Map<string, number>();
  const proxies = new Map<string, Console>();

  const forward = (method: ConsoleMethod, args: readonly unknown[]): void => {
    if (target === undefined) return;
    try {
      const fn = (target as Record<string, unknown>)[method];
      if (typeof fn === 'function') fn.apply(target, args);
    } catch {
      // A broken host console must not break the snippet.
    }
  };

  const record = (
    file: string | undefined,
    method: ConsoleMethod,
    level: ConsoleLevel,
    args: unknown[],
    forwardArgs: readonly unknown[] | null = args,
  ): void => {
    if (forwardArgs !== null) forward(method, forwardArgs);

    let position: { line: number; column?: number } | null = null;
    if (locate) {
      try {
        position = locate(new Error().stack);
      } catch {
        position = null;
      }
    }

    const entry: ConsoleEntry = {
      id: ++nextEntryId,
      level,
      method,
      args,
      timestamp: Date.now(),
      depth,
      ...(file !== undefined ? { file } : {}),
      ...(position ? { line: position.line } : {}),
      ...(position?.column !== undefined ? { column: position.column } : {}),
    };

    try {
      emit(entry);
    } catch {
      // Same rule as forwarding: the sink is the host's problem, not the snippet's.
    }
  };

  const labelOf = (label: unknown): string => (label === undefined ? 'default' : String(label));
  const elapsed = (start: number): string => `${Number((now() - start).toFixed(3))} ms`;

  const build = (file: string | undefined): Console => {
    const proxy = Object.create(target ?? globalThis.console) as Record<string, unknown>;
    const simple =
      (method: ConsoleMethod, level: ConsoleLevel) =>
      (...args: unknown[]): void =>
        record(file, method, level, args);

    proxy['log'] = simple('log', 'log');
    proxy['info'] = simple('info', 'info');
    proxy['warn'] = simple('warn', 'warn');
    proxy['error'] = simple('error', 'error');
    proxy['debug'] = simple('debug', 'debug');
    proxy['trace'] = simple('trace', 'log');
    proxy['table'] = simple('table', 'log');
    proxy['dir'] = simple('dir', 'log');
    proxy['dirxml'] = simple('dirxml', 'log');

    for (const method of ['group', 'groupCollapsed'] as const) {
      proxy[method] = (...args: unknown[]): void => {
        record(file, method, 'log', args);
        depth++;
      };
    }
    proxy['groupEnd'] = (): void => {
      forward('groupEnd', []);
      if (depth > 0) depth--;
    };

    proxy['time'] = (label?: unknown): void => {
      timers.set(labelOf(label), now());
      forward('time', label === undefined ? [] : [label]);
    };
    for (const method of ['timeLog', 'timeEnd'] as const) {
      proxy[method] = (label?: unknown, ...rest: unknown[]): void => {
        const name = labelOf(label);
        const start = timers.get(name);
        const forwarded = label === undefined ? [] : [label, ...rest];
        if (start === undefined) {
          record(file, method, 'warn', [`Timer '${name}' does not exist`], forwarded);
          return;
        }
        if (method === 'timeEnd') timers.delete(name);
        record(file, method, 'info', [`${name}: ${elapsed(start)}`, ...rest], forwarded);
      };
    }

    proxy['count'] = (label?: unknown): void => {
      const name = labelOf(label);
      const next = (counts.get(name) ?? 0) + 1;
      counts.set(name, next);
      record(file, 'count', 'info', [`${name}: ${next}`], label === undefined ? [] : [label]);
    };
    proxy['countReset'] = (label?: unknown): void => {
      counts.set(labelOf(label), 0);
      forward('countReset', label === undefined ? [] : [label]);
    };

    proxy['assert'] = (condition?: unknown, ...args: unknown[]): void => {
      if (condition) return;
      record(file, 'assert', 'error', ['Assertion failed:', ...args], [condition, ...args]);
    };

    // Recorded so a console panel can clear itself, but never forwarded: a
    // snippet has no business wiping the host's DevTools.
    proxy['clear'] = (): void => record(file, 'clear', 'log', [], null);

    return proxy as unknown as Console;
  };

  return {
    proxyFor(file) {
      const key = file ?? '';
      let proxy = proxies.get(key);
      if (!proxy) {
        proxy = build(file);
        proxies.set(key, proxy);
      }
      return proxy;
    },
  };
}
