import { describe, expect, it } from 'vitest';
import { compile } from '../src/core/compile';
import { injectRenderBudgetTick } from '../src/core/inject-render-budget';

describe('injectRenderBudgetTick', () => {
  it('injects into a default-exported function component', () => {
    const source = `export default function Loop() {
  return null;
}`;
    expect(injectRenderBudgetTick(source)).toContain('__liveTick();');
  });

  it('injects into a default-exported arrow component', () => {
    const source = `export default () => {
  return null;
}`;
    expect(injectRenderBudgetTick(source)).toContain('__liveTick();');
  });

  it('never changes the line count', () => {
    const source = `export default function Loop() {
  return null;
}
export function Card() {
  return null;
}`;
    expect(injectRenderBudgetTick(source).split('\n')).toHaveLength(source.split('\n').length);
  });

  /**
   * The regression the same-line injection fixes: under `<LiveProvider>` the
   * render budget is always on, and the extra line used to make `mapPosition`
   * drop the position for any snippet with an `export default function`.
   */
  it('keeps top-level error lines when the render budget is on', async () => {
    const code = [
      'const a = null;',
      'const b = a.x;',
      'export default function App() { return null; }',
    ].join('\n');

    await expect(compile({ code, onRender() {} })).rejects.toMatchObject({ line: 2 });
  });
});
