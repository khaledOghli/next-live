import { describe, expect, it, vi } from 'vitest';
import { createRenderBudget } from '../src/core/guards';
import { RenderLoopError } from '../src/core/errors';

describe('render budget', () => {
  it('allows renders under the threshold', () => {
    const tick = createRenderBudget({ maxRenders: 10, windowMs: 1000 });
    expect(() => {
      for (let i = 0; i < 10; i++) tick();
    }).not.toThrow();
  });

  it('trips once the threshold is exceeded', () => {
    const tick = createRenderBudget({ maxRenders: 5, windowMs: 1000 });
    expect(() => {
      for (let i = 0; i < 50; i++) tick();
    }).toThrow(RenderLoopError);
  });

  /**
   * The regression that matters most.
   *
   * React retries a failed render before handing the error to a boundary. An
   * earlier version reset its counter before throwing, so every retry
   * succeeded, the error never reached the boundary, and the loop ran on
   * forever - it threw thousands of times, invisibly, while the component kept
   * rendering. Latching is what fixes it.
   */
  it('stays tripped on subsequent calls, so a retried render cannot slip through', () => {
    const tick = createRenderBudget({ maxRenders: 3, windowMs: 1000 });
    expect(() => {
      for (let i = 0; i < 10; i++) tick();
    }).toThrow(RenderLoopError);

    // A retry must not succeed just because the window rolled over.
    expect(() => tick()).toThrow(RenderLoopError);
    expect(() => tick()).toThrow(RenderLoopError);
  });

  it('does not trip on sustained but legitimate render rates', () => {
    // 120 renders/second is a plausible ceiling for correct code on a 120 Hz
    // display with React's development double-render. The default of 1000
    // leaves comfortable headroom above it.
    vi.useFakeTimers();
    try {
      const tick = createRenderBudget();
      for (let second = 0; second < 5; second++) {
        for (let i = 0; i < 120; i++) tick();
        vi.advanceTimersByTime(1000);
      }
      expect(() => tick()).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets between windows for code that renders in bursts', () => {
    vi.useFakeTimers();
    try {
      const tick = createRenderBudget({ maxRenders: 10, windowMs: 1000 });
      for (let i = 0; i < 10; i++) tick();
      vi.advanceTimersByTime(1500);
      expect(() => {
        for (let i = 0; i < 10; i++) tick();
      }).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives a fresh budget per instance, so a new compile recovers', () => {
    const tripped = createRenderBudget({ maxRenders: 2 });
    expect(() => {
      for (let i = 0; i < 5; i++) tripped();
    }).toThrow();

    const fresh = createRenderBudget({ maxRenders: 2 });
    expect(() => fresh()).not.toThrow();
  });

  it('explains the likely cause in its message', () => {
    const tick = createRenderBudget({ maxRenders: 1 });
    try {
      tick();
      tick();
      tick();
      throw new Error('expected the breaker to trip');
    } catch (error) {
      expect((error as Error).message).toMatch(/state setter during render|dependency array/);
    }
  });
});
