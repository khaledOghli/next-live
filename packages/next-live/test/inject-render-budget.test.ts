import { describe, expect, it } from 'vitest';
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
});
