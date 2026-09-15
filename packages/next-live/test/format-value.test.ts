import { describe, expect, it } from 'vitest';
import { formatConsoleArgs, formatConsoleValue } from '../src/core/format-value';
import { serializeValue, serializeValues } from '../src/core/serialize-value';

const format = (...args: unknown[]) => formatConsoleArgs(serializeValues(args));

describe('formatConsoleArgs', () => {
  it('prints top-level strings raw and nested strings quoted', () => {
    expect(format('hello', { name: 'Ada', 'kebab-key': 1 })).toBe('hello {name: "Ada", "kebab-key": 1}');
  });

  it('applies printf-style substitutions', () => {
    expect(format('%s has %d items (%f) %o', 'cart', 3.7, 1.5, { a: 1 }, 'extra')).toBe(
      'cart has 3 items (1.5) {a: 1} extra',
    );
    expect(format('%c styled', 'color: red')).toBe(' styled');
    expect(format('100%% sure, %s', 'ok')).toBe('100% sure, ok');
    expect(format('missing %s')).toBe('missing %s');
  });

  it('returns an empty string for no arguments', () => {
    expect(formatConsoleArgs([])).toBe('');
  });
});

describe('formatConsoleValue', () => {
  it('previews containers compactly', () => {
    expect(formatConsoleValue(serializeValue([1, 'a', null]))).toBe('[1, "a", null]');
    expect(formatConsoleValue(serializeValue(new Map([['k', 1]])))).toBe('Map(1) {"k" => 1}');
    expect(formatConsoleValue(serializeValue(new Set([1, 2])))).toBe('Set(2) {1, 2}');
    expect(formatConsoleValue(serializeValue({}))).toBe('{}');
  });

  it('previews special values', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(formatConsoleValue(serializeValue(cyclic))).toBe('{self: [Circular]}');
    expect(formatConsoleValue(serializeValue(new TypeError('bad')))).toBe('TypeError: bad');
    expect(formatConsoleValue(serializeValue(function run() {}))).toBe('ƒ run()');
    expect(formatConsoleValue(serializeValue(10n))).toBe('10n');
    expect(formatConsoleValue(serializeValue(-0))).toBe('-0');
    expect(formatConsoleValue(serializeValue({ a: { b: {} } }, { maxDepth: 1 }))).toBe('{a: {…}}');
  });
});
