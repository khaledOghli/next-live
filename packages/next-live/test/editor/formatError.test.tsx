// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveProvider } from '../../src/components/LiveProvider';
import { LiveError } from '../../src/components/LiveError';
import { LivePreview } from '../../src/components/LivePreview';

afterEach(cleanup);

const BROKEN = `export default function App() { return <b>oops</b>;`;

describe('formatError hardening', () => {
  it('does not crash when formatError throws', async () => {
    render(
      <LiveProvider
        code={BROKEN}
        formatError={() => {
          throw new Error('formatter blew up');
        }}
      >
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });

  it('passes line and column to formatError', async () => {
    const formatError = vi.fn((_error: Error) => 'custom');
    render(
      <LiveProvider
        code={`export default function A() {\n  const x = ;\n}`}
        formatError={formatError}
      >
        <LiveError />
      </LiveProvider>,
    );
    await waitFor(() => expect(formatError).toHaveBeenCalled());
    const position = formatError.mock.calls[0]?.[1];
    expect(position?.line).toBeTypeOf('number');
  });
});
