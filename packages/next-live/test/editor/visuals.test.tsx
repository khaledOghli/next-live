// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveEditor } from '../../src/components/LiveEditor';

afterEach(cleanup);

describe('LiveEditor visuals', () => {
  it('places gutter in column 1 and code in column 2', () => {
    const { container } = render(
      <LiveEditor code={'a\nb'} onChange={() => {}} lineNumbers />,
    );
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toContain('auto');
    const gutter = grid.querySelector('pre[aria-hidden="true"]') as HTMLElement;
    expect(gutter.style.gridColumn).toBe('1');
    expect(container.querySelector('textarea')?.style.gridColumn).toBe('2');
  });

  it('renders diagnostic status list below editor', () => {
    const { container } = render(
      <LiveEditor
        code="x"
        onChange={() => {}}
        diagnostics={[{ line: 1, message: 'typo', severity: 'warning' }]}
      />,
    );
    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toContain('typo');
  });

  it('has no live region by default', () => {
    const { container } = render(<LiveEditor code="x" onChange={() => {}} error={new Error('e')} />);
    expect(container.querySelector('[aria-live]')).toBeNull();
  });

  it('mounts empty live region before announcing errors', async () => {
    const { container, rerender } = render(
      <LiveEditor code="x" onChange={() => {}} announceErrors />,
    );
    const region = container.querySelector('[aria-live="polite"]');
    expect(region).toBeTruthy();
    expect(region?.textContent).toBe('');

    rerender(
      <LiveEditor code="x" onChange={() => {}} error={new Error('boom')} announceErrors />,
    );
    await vi.waitFor(() => expect(region?.textContent).toBe('boom'));
  });
});
