import { describe, expect, it } from 'vitest';
import { isLiveBlock } from '../src/theme/CodeBlock/metastring';

describe('isLiveBlock', () => {
  it('matches bare live token', () => {
    expect(isLiveBlock('live')).toBe(true);
    expect(isLiveBlock('live showLineNumbers')).toBe(true);
  });

  it('ignores live inside double-quoted title', () => {
    expect(isLiveBlock('title="a live demo"')).toBe(false);
  });

  it('ignores live inside single-quoted title', () => {
    expect(isLiveBlock("title='a live demo'")).toBe(false);
  });

  it('ignores delivery.tsx title', () => {
    expect(isLiveBlock('title="delivery.tsx"')).toBe(false);
  });
});
