import { describe, expect, it } from 'vitest';
import { resolveFrameAttributes } from '../../src/sandbox/host/attrs';
import { LIMITS, PROTOCOL_NS, PROTOCOL_VERSION } from '../../src/sandbox/protocol/messages';
import {
  normalizeAllowedOrigins,
  parseHostMessage,
  parseHostWindowMessage,
  parseReadyMessage,
  parseSandboxMessage,
  sanitizeSerialized,
} from '../../src/sandbox/protocol/validate';

const msg = (type: string, fields: Record<string, unknown> = {}, v = PROTOCOL_VERSION) => ({
  ns: PROTOCOL_NS,
  v,
  type,
  ...fields,
});

const HOST = { href: 'https://app.example.com/playground', origin: 'https://app.example.com' };

describe('normalizeAllowedOrigins', () => {
  it('accepts exact origins and the explicit wildcard', () => {
    expect(normalizeAllowedOrigins(['https://app.example.com', 'http://localhost:3000'])).toEqual([
      'https://app.example.com',
      'http://localhost:3000',
    ]);
    expect(normalizeAllowedOrigins('*')).toBe('*');
  });

  it('requires at least one origin', () => {
    expect(() => normalizeAllowedOrigins(undefined)).toThrow(/needs `allowedOrigins`/);
    expect(() => normalizeAllowedOrigins([])).toThrow(/needs `allowedOrigins`/);
  });

  it('rejects URLs that are not bare origins, showing the fix', () => {
    expect(() => normalizeAllowedOrigins(['https://app.example.com/'])).toThrow("'https://app.example.com'");
    expect(() => normalizeAllowedOrigins(['https://app.example.com/path'])).toThrow(/is not an origin/);
    expect(() => normalizeAllowedOrigins(['app.example.com'])).toThrow(/not a valid origin/);
    expect(() => normalizeAllowedOrigins([42])).toThrow(/must be a string/);
  });
});

describe('resolveFrameAttributes', () => {
  it('defaults to scripts only, an opaque origin and a locked-down permissions policy', () => {
    const attrs = resolveFrameAttributes({ src: '/sandbox' }, HOST, true);
    expect(attrs).toMatchObject({
      src: 'https://app.example.com/sandbox',
      sandbox: 'allow-scripts',
      expectedOrigin: 'null',
      referrerPolicy: 'no-referrer',
      credentialless: true,
    });
    expect(attrs.allow).toContain("camera 'none'");
  });

  it('adds allowlisted permissions once each', () => {
    const attrs = resolveFrameAttributes({ src: '/sandbox', permissions: ['allow-forms', 'allow-forms', 'allow-modals'] }, HOST, false);
    expect(attrs.sandbox).toBe('allow-scripts allow-forms allow-modals');
    expect(attrs.credentialless).toBe(false);
  });

  it('refuses permissions outside the allowlist, including allow-same-origin', () => {
    expect(() =>
      resolveFrameAttributes({ src: '/sandbox', permissions: ['allow-same-origin' as never] }, HOST, true),
    ).toThrow(/not an allowed sandbox permission/);
    expect(() =>
      resolveFrameAttributes({ src: '/sandbox', permissions: ['allow-top-navigation' as never] }, HOST, true),
    ).toThrow(expect.objectContaining({ reason: 'invalid-config' }));
  });

  it('refuses javascript:, data: and blob: sources', () => {
    for (const src of ['javascript:alert(1)', 'data:text/html,<script></script>', 'blob:https://app.example.com/x']) {
      expect(() => resolveFrameAttributes({ src }, HOST, true)).toThrow(/must be an http\(s\) URL/);
    }
  });

  it('allows a real origin only for a cross-origin sandbox', () => {
    const attrs = resolveFrameAttributes(
      { src: 'https://sandbox.example.net/runner', allowSameOrigin: true },
      HOST,
      true,
    );
    expect(attrs.sandbox).toBe('allow-scripts allow-same-origin');
    expect(attrs.expectedOrigin).toBe('https://sandbox.example.net');

    expect(() => resolveFrameAttributes({ src: '/sandbox', allowSameOrigin: true }, HOST, true)).toThrow(
      expect.objectContaining({ code: 'SANDBOX', reason: 'same-origin-refused' }),
    );
  });
});

describe('parseSandboxMessage', () => {
  it('accepts a well-formed compiled message and copies only known fields', () => {
    const parsed = parseSandboxMessage(
      msg('compiled', { revision: 3, imports: ['react'], via: 'export default', durationMs: 4.5, extra: 'dropped' }),
    );
    expect(parsed).toEqual(msg('compiled', { revision: 3, imports: ['react'], via: 'export default', durationMs: 4.5 }));
  });

  it('ignores other namespaces, other versions and unknown types', () => {
    expect(parseSandboxMessage({ ...msg('pong', { seq: 1 }), ns: 'someone-else' })).toBeNull();
    expect(parseSandboxMessage(msg('pong', { seq: 1 }, 2))).toBeNull();
    expect(parseSandboxMessage(msg('surprise'))).toBeNull();
    expect(parseSandboxMessage('pong')).toBeNull();
  });

  it('still reads a fatal message from a different protocol version', () => {
    expect(
      parseSandboxMessage(msg('fatal', { reason: 'protocol-mismatch', message: 'upgrade', supported: [2] }, 2)),
    ).toMatchObject({ type: 'fatal', reason: 'protocol-mismatch', supported: [2] });
  });

  it('bounds imports and clips long strings', () => {
    const imports = Array.from({ length: 800 }, (_, i) => `pkg-${i}`.padEnd(400, 'x'));
    const parsed = parseSandboxMessage(msg('compiled', { revision: 1, imports, durationMs: 1 }));
    expect(parsed?.type === 'compiled' && parsed.imports.length).toBe(LIMITS.maxImports);
    expect(parsed?.type === 'compiled' && (parsed.imports[0] as string).length).toBeLessThanOrEqual(LIMITS.maxShortChars + 1);
  });

  it('clamps resize heights', () => {
    expect(parseSandboxMessage(msg('resize', { height: 1e9 }))).toMatchObject({ height: LIMITS.maxHeight });
    expect(parseSandboxMessage(msg('resize', { height: -20 }))).toMatchObject({ height: 0 });
    expect(parseSandboxMessage(msg('resize', { height: 120.2 }), { maxHeight: 500 })).toMatchObject({ height: 121 });
    expect(parseSandboxMessage(msg('resize', { height: NaN }))).toBeNull();
  });

  it('caps console batches and drops malformed entries', () => {
    const good = { revision: 1, level: 'log', method: 'log', serialized: [{ t: 'string', v: 'hi' }], timestamp: 1, depth: 0 };
    const entries = [...Array.from({ length: 300 }, () => good), { ...good, level: 'shout' }];
    const parsed = parseSandboxMessage(msg('console', { entries }));
    expect(parsed?.type === 'console' && parsed.entries.length).toBe(LIMITS.maxConsoleBatch);

    const mixed = parseSandboxMessage(msg('console', { entries: [good, { ...good, method: 'eval' }, null] }));
    expect(mixed?.type === 'console' && mixed.entries).toHaveLength(1);
  });

  it('requires an error payload object on error messages', () => {
    expect(parseSandboxMessage(msg('error', { revision: 1, phase: 'runtime', error: 'nope' }))).toBeNull();
    expect(parseSandboxMessage(msg('error', { revision: 1, phase: 'later', error: {} }))).toBeNull();
    expect(parseSandboxMessage(msg('error', { revision: 1, phase: 'compile', error: { message: 'x' } }))).toMatchObject({
      phase: 'compile',
    });
  });

  it('reads ready from the window', () => {
    expect(parseReadyMessage(msg('ready', { runtime: '1.1.0' }))).toMatchObject({ type: 'ready', runtime: '1.1.0' });
    expect(parseReadyMessage(msg('pong', { seq: 1 }))).toBeNull();
  });
});

describe('sanitizeSerialized', () => {
  it('passes known shapes through and replaces unknown ones', () => {
    expect(sanitizeSerialized({ t: 'object', entries: [['a', { t: 'number', v: 1 }]], evil: true })).toEqual({
      t: 'object',
      entries: [['a', { t: 'number', v: 1 }]],
    });
    expect(sanitizeSerialized({ t: 'html', v: '<img onerror=alert(1)>' })).toEqual({ t: 'unserializable' });
    expect(sanitizeSerialized({ t: 'number', v: '1e999' })).toEqual({ t: 'unserializable' });
  });

  it('bounds depth, node count and string length', () => {
    let nested: unknown = { t: 'null' };
    for (let i = 0; i < 50; i++) nested = { t: 'array', items: [nested], length: 1 };
    expect(JSON.stringify(sanitizeSerialized(nested))).toContain('"depth"');

    const wide = { t: 'array', items: Array.from({ length: 100 }, () => ({ t: 'array', items: Array(100).fill({ t: 'null' }), length: 100 })), length: 100 };
    expect(JSON.stringify(sanitizeSerialized(wide, { nodes: 50 }))).toContain('"depth"');

    const long = sanitizeSerialized({ t: 'string', v: 'x'.repeat(50_000) });
    expect(long.t === 'string' && long.v.length).toBeLessThanOrEqual(10_001);
  });
});

describe('parseHostMessage', () => {
  const update = (fields: Record<string, unknown> = {}) =>
    msg('update', { revision: 1, source: { kind: 'code', code: '<b/>' }, props: {}, options: {}, ...fields });

  it('accepts a code update and fills option defaults', () => {
    expect(parseHostMessage(update())).toMatchObject({
      type: 'update',
      source: { kind: 'code', code: '<b/>' },
      options: { keepLastGood: true, maxRendersPerSecond: 1000, captureConsole: false, forwardConsole: true },
    });
  });

  it('accepts a files update within limits', () => {
    const parsed = parseHostMessage(update({ source: { kind: 'files', files: { 'App.tsx': 'x', 'B.tsx': 'y' }, entry: 'App.tsx' } }));
    expect(parsed).toMatchObject({ source: { kind: 'files', entry: 'App.tsx' } });
  });

  it('refuses oversized code, too many files and non-string sources', () => {
    expect(parseHostMessage(update({ source: { kind: 'code', code: 'x'.repeat(20) } }), { maxCodeChars: 10 })).toBeNull();
    const many = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`f${i}.ts`, '']));
    expect(parseHostMessage(update({ source: { kind: 'files', files: many } }), { maxFiles: 4 })).toBeNull();
    expect(parseHostMessage(update({ source: { kind: 'files', files: { 'a.ts': 1 } } }))).toBeNull();
    expect(parseHostMessage(update({ props: 'not an object' }))).toBeNull();
  });

  it('keeps only known, correctly typed options', () => {
    const parsed = parseHostMessage(
      update({ options: { jsxRuntime: 'classic', production: 'yes', maxRendersPerSecond: -1, captureConsole: true, eval: 'x' } }),
    );
    expect(parsed?.type === 'update' && parsed.options).toEqual({
      jsxRuntime: 'classic',
      keepLastGood: true,
      maxRendersPerSecond: 1000,
      captureConsole: true,
      forwardConsole: true,
    });
  });

  it('reads init from any version, so a mismatch can be explained', () => {
    expect(parseHostWindowMessage(msg('init', { session: 'abc', host: '2.0.0' }, 2))).toMatchObject({ v: 2, session: 'abc' });
    expect(parseHostWindowMessage(msg('init', {}))).toBeNull();
    expect(parseHostWindowMessage(msg('probe'))).toMatchObject({ type: 'probe' });
  });
});
