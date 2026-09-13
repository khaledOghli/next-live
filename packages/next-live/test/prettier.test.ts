import { describe, expect, it } from 'vitest';
import { createPrettierFormatter } from '../src/prettier';

describe('createPrettierFormatter', () => {
  it('formats TSX with real prettier', async () => {
    const format = createPrettierFormatter();
    const result = await format('const x=1', { language: 'tsx', cursorOffset: 0 });
    const formatted = typeof result === 'string' ? result : result.code;
    expect(formatted).toContain('const x = 1');
  });

  it('rejects unsupported languages', async () => {
    const format = createPrettierFormatter();
    await expect(format('x', { language: 'css', cursorOffset: 0 })).rejects.toThrow(
      /not supported/i,
    );
  });
});
