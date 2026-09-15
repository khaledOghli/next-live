// @vitest-environment jsdom
/**
 * Scenario: a multi-file snippet in the components, the way a playground with
 * file tabs is built.
 *
 * Most of the contract is about what must *not* happen: switching tabs never
 * recompiles, an inline `files={{...}}` literal with unchanged content never
 * recompiles, and a single `code` snippet sees none of the new state.
 */
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LiveProvider } from '../../src/components/LiveProvider';
import { LivePreview } from '../../src/components/LivePreview';
import { LiveError } from '../../src/components/LiveError';
import { LiveEditor } from '../../src/components/LiveEditor';
import { LiveFileTabs } from '../../src/components/LiveFileTabs';
import { useLiveContext } from '../../src/hooks/useLiveContext';
import { useLiveModule } from '../../src/hooks/useLiveModule';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const APP = `import { Button } from './Button';
export default function App() { return <Button />; }`;
const button = (label: string) => `export function Button() { return <b data-testid="out">${label}</b>; }`;
const FILES = { 'App.tsx': APP, 'Button.tsx': button('v1') };

const settled = (text: string) =>
  waitFor(() => expect(screen.getByTestId('out').textContent).toBe(text), { timeout: 4000 });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const editor = () => screen.getByLabelText('Live code editor') as HTMLTextAreaElement;

describe('scenario: a playground with file tabs', () => {
  it('renders the project and edits whichever tab is selected', async () => {
    render(
      <LiveProvider files={FILES} debounce={0}>
        <LiveFileTabs />
        <LiveEditor />
        <LivePreview />
      </LiveProvider>,
    );
    await settled('v1');
    expect(editor().value).toBe(APP);

    fireEvent.click(screen.getByRole('tab', { name: 'Button.tsx' }));
    expect(editor().value).toBe(button('v1'));
    expect(screen.getByRole('tab', { name: 'Button.tsx' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.change(editor(), { target: { value: button('v2') } });
    await settled('v2');
  });

  it('does not recompile when switching tabs', async () => {
    const onCompileSuccess = vi.fn();
    render(
      <LiveProvider files={FILES} debounce={0} onCompileSuccess={onCompileSuccess}>
        <LiveFileTabs />
        <LivePreview />
      </LiveProvider>,
    );
    await settled('v1');
    fireEvent.click(screen.getByRole('tab', { name: 'Button.tsx' }));
    fireEvent.click(screen.getByRole('tab', { name: 'App.tsx' }));
    await pause(50);
    expect(onCompileSuccess).toHaveBeenCalledTimes(1);
    expect(onCompileSuccess.mock.calls[0]?.[0]).toMatchObject({ entry: 'App.tsx', files: ['App.tsx', 'Button.tsx'] });
  });

  it('does not recompile for a new files object with the same content', async () => {
    const onCompileSuccess = vi.fn();
    const tree = () => (
      <LiveProvider files={{ ...FILES }} debounce={0} onCompileSuccess={onCompileSuccess}>
        <LivePreview />
      </LiveProvider>
    );
    const { rerender } = render(tree());
    await settled('v1');
    rerender(tree());
    rerender(tree());
    await pause(50);
    expect(onCompileSuccess).toHaveBeenCalledTimes(1);
  });

  it('follows the files prop when the host changes it', async () => {
    const { rerender } = render(
      <LiveProvider files={FILES} debounce={0}>
        <LivePreview />
      </LiveProvider>,
    );
    await settled('v1');
    rerender(
      <LiveProvider files={{ ...FILES, 'Button.tsx': button('from host') }} debounce={0}>
        <LivePreview />
      </LiveProvider>,
    );
    await settled('from host');
  });

  it('reports edits with every file and the key that changed', async () => {
    const onFilesChange = vi.fn();
    render(
      <LiveProvider files={FILES} debounce={0} onFilesChange={onFilesChange}>
        <LiveEditor file="Button.tsx" />
        <LivePreview />
      </LiveProvider>,
    );
    fireEvent.change(editor(), { target: { value: button('edited') } });
    expect(onFilesChange).toHaveBeenCalledWith({ ...FILES, 'Button.tsx': button('edited') }, 'Button.tsx');
    await settled('edited');
  });

  it('compiles once per edit when the host echoes onFilesChange back as the files prop', async () => {
    const onCompileSuccess = vi.fn();
    function Controlled() {
      const [files, setFiles] = React.useState<Record<string, string>>(FILES);
      return (
        <LiveProvider files={files} onFilesChange={(next) => setFiles({ ...next })} debounce={0} onCompileSuccess={onCompileSuccess}>
          <LiveEditor file="Button.tsx" />
          <LivePreview />
        </LiveProvider>
      );
    }
    render(<Controlled />);
    await settled('v1');
    fireEvent.change(editor(), { target: { value: button('echoed') } });
    await settled('echoed');
    await pause(50);
    expect(onCompileSuccess).toHaveBeenCalledTimes(2);
  });

  it('pins an editor to one file with the file prop', async () => {
    render(
      <LiveProvider files={FILES} debounce={0}>
        <LiveEditor file="Button.tsx" />
      </LiveProvider>,
    );
    expect(editor().value).toBe(button('v1'));
  });

  it('renders a different entry when the entry prop changes', async () => {
    const files = { ...FILES, 'Other.tsx': `export default () => <i data-testid="out">other</i>;` };
    const { rerender } = render(
      <LiveProvider files={files} debounce={0}>
        <LivePreview />
      </LiveProvider>,
    );
    await settled('v1');
    rerender(
      <LiveProvider files={files} entry="Other.tsx" debounce={0}>
        <LivePreview />
      </LiveProvider>,
    );
    await settled('other');
  });

  it('marks the failing tab and underlines only in the file that failed', async () => {
    const broken = { 'App.tsx': APP, 'Button.tsx': `const config: any = null;\nconfig.missing;\n${button('x')}` };
    render(
      <LiveProvider files={broken} debounce={0}>
        <LiveFileTabs />
        <LiveEditor renderEditor={(props) => <output data-testid="line">{String(props.errorLine)}</output>} />
        <LiveError />
      </LiveProvider>,
    );
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/null/));

    expect(screen.getByRole('tab', { name: 'Button.tsx' }).hasAttribute('data-error')).toBe(true);
    expect(screen.getByRole('tab', { name: 'App.tsx' }).hasAttribute('data-error')).toBe(false);
    expect(screen.getByTestId('line').textContent).toBe('undefined');

    fireEvent.click(screen.getByRole('tab', { name: 'Button.tsx' }));
    expect(screen.getByTestId('line').textContent).toBe('2');
  });

  it('supports arrow, Home and End keys on the tabs', async () => {
    const files = { ...FILES, 'styles.ts': `export const color = 'red';` };
    render(
      <LiveProvider files={files} debounce={0}>
        <LiveFileTabs />
      </LiveProvider>,
    );
    const tab = (name: string) => screen.getByRole('tab', { name });

    tab('App.tsx').focus();
    fireEvent.keyDown(tab('App.tsx'), { key: 'ArrowRight' });
    expect(tab('Button.tsx').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Button.tsx'));

    fireEvent.keyDown(tab('Button.tsx'), { key: 'End' });
    expect(tab('styles.ts').getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(tab('styles.ts'), { key: 'ArrowRight' });
    expect(tab('App.tsx').getAttribute('aria-selected')).toBe('true');

    expect(tab('App.tsx').tabIndex).toBe(0);
    expect(tab('Button.tsx').tabIndex).toBe(-1);
  });

  it('lets the host control the active file', async () => {
    const onActiveFileChange = vi.fn();
    render(
      <LiveProvider files={FILES} activeFile="Button.tsx" onActiveFileChange={onActiveFileChange} debounce={0}>
        <LiveFileTabs />
        <LiveEditor />
      </LiveProvider>,
    );
    expect(editor().value).toBe(button('v1'));
    fireEvent.click(screen.getByRole('tab', { name: 'App.tsx' }));
    expect(onActiveFileChange).toHaveBeenCalledWith('App.tsx');
    // Controlled: nothing changes until the host passes a new activeFile.
    expect(editor().value).toBe(button('v1'));
  });
});

describe('scenario: single snippets are untouched', () => {
  it('renders no tabs and exposes no multi-file state', async () => {
    let keys: string[] = [];
    function Probe() {
      keys = Object.keys(useLiveContext());
      return null;
    }
    render(
      <LiveProvider code={`export default () => <b data-testid="out">single</b>;`} debounce={0}>
        <LiveFileTabs />
        <LivePreview />
        <Probe />
      </LiveProvider>,
    );
    await settled('single');
    expect(screen.queryByRole('tablist')).toBeNull();
    for (const key of ['files', 'entry', 'activeFile', 'setActiveFile', 'setFile', 'setFiles']) {
      expect(keys).not.toContain(key);
    }
  });
});

describe('scenario: useLiveModule with files', () => {
  it('returns the entry file exports', async () => {
    function Rules() {
      const { value } = useLiveModule({
        files: {
          'rules.ts': `import { limit } from './limits';\nexport default (n: number) => n <= limit;`,
          'limits.ts': `export const limit = 3;`,
        },
        debounce: 0,
      });
      return <b data-testid="out">{typeof value === 'function' ? String(value(2)) : 'loading'}</b>;
    }
    render(<Rules />);
    await settled('true');
  });
});

describe('scenario: provider warnings', () => {
  it('warns when there is nothing to run, or when both code and files are given', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = render(<LiveProvider>{null}</LiveProvider>);
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining('needs a `code` or a `files` prop')));

    rerender(<LiveProvider code="<b/>" files={FILES}>{null}</LiveProvider>);
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining('`files` is used and `code` is ignored')));
  });
});
