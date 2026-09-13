export type LiveErrorCode =
  | 'COMPILE'
  | 'RUNTIME'
  | 'MODULE_NOT_FOUND'
  | 'NO_COMPONENT'
  | 'RENDER_LOOP'
  | 'TRANSPILER_LOAD';

/** Base class for every error next-live raises. */
export class LiveError extends Error {
  readonly code: LiveErrorCode;

  constructor(message: string, options?: { cause?: unknown; code?: LiveErrorCode }) {
    super(message);
    this.name = new.target.name;
    this.code = options?.code ?? 'RUNTIME';
    if (options?.cause !== undefined) this.cause = options.cause;
    // Restores the prototype chain when compiled down to ES5 by a consumer.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** The snippet could not be parsed or transpiled. */
export class LiveCompileError extends LiveError {
  declare readonly code: 'COMPILE';
  readonly line: number | undefined;
  readonly column: number | undefined;

  constructor(message: string, position?: { line?: number; column?: number }, cause?: unknown) {
    super(message, { cause, code: 'COMPILE' });
    this.line = position?.line;
    this.column = position?.column;
  }
}

/** The snippet threw while being evaluated or rendered. */
export class LiveRuntimeError extends LiveError {
  constructor(message: string, options?: { cause?: unknown; code?: 'RUNTIME' }) {
    super(message, { cause: options?.cause, code: options?.code ?? 'RUNTIME' });
  }
}

/** A render loop was detected and stopped. */
export class RenderLoopError extends LiveRuntimeError {
  declare readonly code: 'RENDER_LOOP';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    Object.defineProperty(this, 'code', { value: 'RENDER_LOOP' });
  }
}

/** `import` referenced a specifier that is not in the registry. */
export class ModuleNotFoundError extends LiveError {
  declare readonly code: 'MODULE_NOT_FOUND';

  constructor(
    readonly specifier: string,
    readonly available: readonly string[],
  ) {
    super(buildModuleNotFoundMessage(specifier, available), { code: 'MODULE_NOT_FOUND' });
  }
}

/** The snippet compiled and ran but produced nothing renderable. */
export class NoComponentError extends LiveError {
  declare readonly code: 'NO_COMPONENT';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { ...options, code: 'NO_COMPONENT' });
  }
}

/** Sucrase could not be loaded (usually a chunk-load failure). */
export class TranspilerLoadError extends LiveError {
  declare readonly code: 'TRANSPILER_LOAD';

  constructor(cause: unknown) {
    super(
      'next-live could not load its transpiler (sucrase). This is usually a ' +
        'network or code-splitting failure - check that the chunk is reachable.',
      { cause, code: 'TRANSPILER_LOAD' },
    );
  }
}

const MAX_LISTED = 12;

function buildModuleNotFoundMessage(specifier: string, available: readonly string[]): string {
  const lines = [`Module '${specifier}' is not registered in the next-live scope.`];

  const suggestion = nearestSpecifier(specifier, available);
  if (suggestion) lines.push('', `Did you mean '${suggestion}'?`);

  if (available.length > 0) {
    const sorted = [...available].sort();
    const shown = sorted.slice(0, MAX_LISTED);
    const rest = sorted.length - shown.length;
    lines.push(
      '',
      `Registered modules (${sorted.length}): ${shown.join(', ')}` +
        (rest > 0 ? `, …and ${rest} more` : ''),
    );
  } else {
    lines.push('', 'No modules are registered.');
  }

  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    lines.push(
      '',
      'next-live does not bundle npm packages - pass them in explicitly:',
      `  <LiveProvider modules={{ '${specifier}': theModule }} />`,
    );
  }

  return lines.join('\n');
}

/**
 * Closest registered specifier by edit distance, or undefined if nothing is
 * close enough to be worth suggesting.
 */
export function nearestSpecifier(
  specifier: string,
  available: readonly string[],
): string | undefined {
  const lower = specifier.toLowerCase();

  const caseMatch = available.find((key) => key.toLowerCase() === lower);
  if (caseMatch) return caseMatch;

  const threshold = Math.max(1, Math.min(3, Math.floor(specifier.length / 3)));
  let best: string | undefined;
  let bestDistance = threshold + 1;

  for (const key of available) {
    if (Math.abs(key.length - specifier.length) > threshold) continue;
    const distance = editDistance(lower, key.toLowerCase(), bestDistance);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = key;
    }
  }

  return bestDistance <= threshold ? best : undefined;
}

function editDistance(a: string, b: string, limit: number): number {
  if (a === b) return 0;
  let previous = new Array<number>(b.length + 1);
  let current = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j++) previous[j] = j;

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const value = Math.min(
        (current[j - 1] as number) + 1,
        (previous[j] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > limit) return limit + 1;
    const swap = previous;
    previous = current;
    current = swap;
  }

  return previous[b.length] as number;
}
