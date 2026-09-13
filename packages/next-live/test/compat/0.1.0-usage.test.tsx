// @vitest-environment jsdom
/**
 * Pins 0.1.0-style public API usage so 1.0.0 stays backward compatible.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LiveEditor } from '../../src/components/LiveEditor';
import { LiveError as LiveErrorBase, LiveRuntimeError, RenderLoopError } from '../../src/core/errors';

afterEach(cleanup);

describe('0.1.0 compatibility', () => {
  it('LiveErrorBase(message, { cause }) works', () => {
    const cause = new Error('inner');
    const err = new LiveErrorBase('msg', { cause });
    expect(err.message).toBe('msg');
    expect(err.cause).toBe(cause);
  });

  it('RenderLoopError matches instanceof LiveRuntimeError', () => {
    const err = new RenderLoopError('loop');
    expect(err).toBeInstanceOf(RenderLoopError);
    expect(err).toBeInstanceOf(LiveRuntimeError);
    expect(err).toBeInstanceOf(LiveErrorBase);
  });

  it('default LiveEditor has no live region and Escape-only shortcuts', () => {
    const { container } = render(<LiveEditor code="x" onChange={() => {}} />);
    const el = container.querySelector('textarea');
    expect(el?.getAttribute('aria-keyshortcuts')).toBe('Escape');
    expect(container.querySelector('[aria-live]')).toBeNull();
  });
});
