// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LiveProvider } from '../../src/components/LiveProvider';
import { useLiveContext } from '../../src/hooks/useLiveContext';

afterEach(cleanup);

describe('formatError context stability', () => {
  it('keeps the stable formatError wrapper when the prop reference changes', () => {
    const formatters: Array<ReturnType<typeof useLiveContext>['formatError']> = [];

    function Capture() {
      formatters.push(useLiveContext().formatError);
      return null;
    }

    const { rerender } = render(
      <LiveProvider code="export default () => null;" formatError={(e) => e.message}>
        <Capture />
      </LiveProvider>,
    );

    rerender(
      <LiveProvider
        code="export default () => null;"
        formatError={(e) => `custom: ${e.message}`}
      >
        <Capture />
      </LiveProvider>,
    );

    expect(formatters).toHaveLength(2);
    expect(formatters[1]).toBe(formatters[0]);
    expect(formatters[0]?.(new Error('x'), { line: 1 })).toBe('custom: x');
  });
});
