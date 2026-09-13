import { RenderLoopError } from './errors';

export interface RenderBudgetOptions {
  /** Renders allowed inside one window before the breaker trips. Default 1000. */
  maxRenders?: number;
  /** Length of the rolling window in milliseconds. Default 1000. */
  windowMs?: number;
}

/**
 * A circuit breaker for runaway re-renders.
 *
 * This is the one class of hang that *can* be caught in the host realm. A
 * synchronous `while (true)` blocks the main thread and nothing - no timer, no
 * AbortController, will ever run again. But the common real failure in
 * authored code is not that: it is `setState` during render, or an effect with
 * a bad dependency array, which React executes as a rapid *sequence* of
 * renders. Between them the breaker gets to run, so it can stop the loop.
 *
 * The throw happens during render so the nearest error boundary catches it and
 * the host application stays alive.
 *
 * @experimental Not covered by semver. May change in minor releases.
 */
export function createRenderBudget(options: RenderBudgetOptions = {}): () => void {
  // Chosen from measurement, not taste. A real runaway loop was observed at
  // ~33,000 renders/second. Legitimate UI is bounded by the display refresh
  // rate (60-120Hz), doubled by React's development double-render - so ~240/s
  // is the realistic ceiling for correct code. 1000 sits comfortably above
  // anything legitimate and far below a true loop, which still trips in ~30ms.
  // An earlier default of 60 was below the legitimate ceiling and could fire on
  // a fast slider drag or an animated snippet.
  const maxRenders = options.maxRenders ?? 1000;
  const windowMs = options.windowMs ?? 1000;

  const message =
    `This component rendered more than ${maxRenders} times in ${windowMs}ms, ` +
    'so next-live stopped it to keep the page responsive.\n\n' +
    'The usual causes are calling a state setter during render, or a ' +
    'useEffect that updates state without a correct dependency array.';

  let windowStart = 0;
  let count = 0;
  let tripped = false;

  return function tick(): void {
    // Once tripped, stay tripped. React retries a failed render before handing
    // the error to a boundary, so a breaker that cleared its own counter would
    // let every retry succeed - the error would never surface and the loop
    // would run on forever. A fixed snippet recovers because each compile
    // builds a fresh budget, not because this one forgives.
    if (tripped) throw new RenderLoopError(message);

    const now = Date.now();
    if (now - windowStart > windowMs) {
      windowStart = now;
      count = 0;
    }
    count += 1;
    if (count > maxRenders) {
      tripped = true;
      throw new RenderLoopError(message);
    }
  };
}
