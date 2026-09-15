import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { serializeValue, serializeValues } from '../src/core/serialize-value';

describe('serializeValue', () => {
  it('describes primitives, including the numbers JSON cannot hold', () => {
    expect(serializeValues([undefined, null, true, 1.5, 'hi', 10n, Symbol('s')])).toEqual([
      { t: 'undefined' },
      { t: 'null' },
      { t: 'boolean', v: true },
      { t: 'number', v: 1.5 },
      { t: 'string', v: 'hi' },
      { t: 'bigint', v: '10' },
      { t: 'symbol', v: 's' },
    ]);
    expect(serializeValues([NaN, Infinity, -Infinity, -0])).toEqual([
      { t: 'number', v: 'NaN' },
      { t: 'number', v: 'Infinity' },
      { t: 'number', v: '-Infinity' },
      { t: 'number', v: '-0' },
    ]);
  });

  it('truncates long strings and says how long they were', () => {
    expect(serializeValue('abcdef', { maxString: 3 })).toEqual({ t: 'string', v: 'abc', truncated: 6 });
  });

  it('tells function kinds apart', () => {
    expect(serializeValue(function named() {})).toEqual({ t: 'function', name: 'named', kind: 'function' });
    expect(serializeValue(class Klass {})).toMatchObject({ kind: 'class', name: 'Klass' });
    expect(serializeValue(async () => {})).toMatchObject({ kind: 'async' });
    expect(serializeValue(function* gen() {})).toMatchObject({ kind: 'generator' });
  });

  it('describes errors with their cause', () => {
    const error = new Error('outer', { cause: new TypeError('inner') });
    expect(serializeValue(error)).toMatchObject({
      t: 'error',
      name: 'Error',
      message: 'outer',
      cause: { t: 'error', name: 'TypeError', message: 'inner' },
    });
  });

  it('describes dates, regexps, maps, sets and typed arrays', () => {
    expect(serializeValue(new Date(0))).toEqual({ t: 'date', v: '1970-01-01T00:00:00.000Z' });
    expect(serializeValue(new Date(NaN))).toEqual({ t: 'date', v: 'Invalid Date' });
    expect(serializeValue(/a+/gi)).toEqual({ t: 'regexp', v: '/a+/gi' });
    expect(serializeValue(new Map([['k', 1]]))).toEqual({
      t: 'map',
      size: 1,
      entries: [[{ t: 'string', v: 'k' }, { t: 'number', v: 1 }]],
    });
    expect(serializeValue(new Set([1]))).toEqual({ t: 'set', size: 1, items: [{ t: 'number', v: 1 }] });
    expect(serializeValue(new Uint8Array(4))).toEqual({ t: 'typed', ctor: 'Uint8Array', length: 4 });
    expect(serializeValue(Promise.resolve())).toEqual({ t: 'promise' });
    expect(serializeValue(new WeakMap())).toEqual({ t: 'weak', ctor: 'WeakMap' });
  });

  it('flags cycles but prints a shared reference in full each time', () => {
    const cyclic: Record<string, unknown> = { name: 'loop' };
    cyclic['self'] = cyclic;
    expect(serializeValue(cyclic)).toEqual({
      t: 'object',
      entries: [
        ['name', { t: 'string', v: 'loop' }],
        ['self', { t: 'circular' }],
      ],
    });

    const shared = { id: 1 };
    const both = serializeValue([shared, shared]) as { items: unknown[] };
    expect(both.items[0]).toEqual(both.items[1]);
    expect(both.items[0]).toMatchObject({ t: 'object' });
  });

  it('summarises beyond the depth limit and caps keys and items', () => {
    expect(serializeValue({ a: { b: { c: 1 } } }, { maxDepth: 2 })).toEqual({
      t: 'object',
      entries: [['a', { t: 'object', entries: [['b', { t: 'depth' }]] }]],
    });
    expect(serializeValue({ a: 1, b: 2, c: 3 }, { maxKeys: 2 })).toMatchObject({ more: 1 });
    expect(serializeValue([1, 2, 3], { maxItems: 2 })).toMatchObject({ length: 3 });
  });

  it('lists getters without running them', () => {
    let calls = 0;
    const value = {
      get expensive() {
        calls++;
        return 1;
      },
    };
    expect(serializeValue(value)).toEqual({ t: 'object', entries: [['expensive', { t: 'getter' }]] });
    expect(calls).toBe(0);
  });

  it('names class instances', () => {
    class Point {
      x = 1;
    }
    expect(serializeValue(new Point())).toMatchObject({ t: 'object', ctor: 'Point' });
  });

  it('survives a revoked proxy', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(serializeValue(proxy)).toMatchObject({ t: 'unserializable' });
  });

  it('describes React elements by type name', () => {
    function Card() {
      return null;
    }
    expect(serializeValue(createElement(Card, { title: 'x' }))).toMatchObject({
      t: 'react',
      type: 'Card',
      key: null,
      props: { t: 'object', entries: [['title', { t: 'string', v: 'x' }]] },
    });
    expect(serializeValue(createElement('div', { key: 'k' }))).toMatchObject({ type: 'div', key: 'k' });
  });

  it('shares one node budget across arguments', () => {
    const wide = Array.from({ length: 50 }, (_, i) => ({ i }));
    const [first, second] = serializeValues([wide, wide], { maxNodes: 60, maxItems: 100 });
    expect(first).toMatchObject({ t: 'array', length: 50 });
    // The budget ran out on the first argument, so the second is summarised whole.
    expect(second).toEqual({ t: 'depth', ctor: 'Array' });
  });

  it('always produces JSON- and structuredClone-safe output', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    const out = serializeValues([
      cyclic,
      new Error('e'),
      () => 1,
      Symbol('x'),
      10n,
      new Map([[{}, new Set([1])]]),
      createElement('b'),
      -0,
    ]);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    expect(structuredClone(out)).toEqual(out);
  });
});
