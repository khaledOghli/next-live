import type { SerializedValue } from './serialize-value';

const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/;

/**
 * A one-line preview of a serialized value, roughly the way DevTools prints a
 * collapsed value. `nested` quotes strings, as they read inside a container.
 */
export function formatConsoleValue(value: SerializedValue, nested = false): string {
  switch (value.t) {
    case 'undefined':
      return 'undefined';
    case 'null':
      return 'null';
    case 'boolean':
    case 'number':
      return String(value.v);
    case 'string': {
      const text = value.truncated !== undefined ? `${value.v}…` : value.v;
      return nested ? JSON.stringify(text) : text;
    }
    case 'bigint':
      return `${value.v}n`;
    case 'symbol':
      return `Symbol(${value.v})`;
    case 'function': {
      const name = value.name || '(anonymous)';
      if (value.kind === 'class') return `class ${name}`;
      if (value.kind === 'async') return `async ƒ ${name}()`;
      if (value.kind === 'generator') return `ƒ* ${name}()`;
      return `ƒ ${name}()`;
    }
    case 'error':
      return value.message ? `${value.name}: ${value.message}` : value.name;
    case 'date':
    case 'regexp':
      return value.v;
    case 'array': {
      const items = value.items.map((item) => formatConsoleValue(item, true));
      const more = value.length - value.items.length;
      if (more > 0) items.push(`…${more} more`);
      return `[${items.join(', ')}]`;
    }
    case 'object': {
      const entries = value.entries.map(
        ([key, item]) => `${IDENTIFIER_RE.test(key) ? key : JSON.stringify(key)}: ${formatConsoleValue(item, true)}`,
      );
      if (value.more) entries.push('…');
      const body = entries.length > 0 ? `{${entries.join(', ')}}` : '{}';
      return value.ctor ? `${value.ctor} ${body}` : body;
    }
    case 'map': {
      const entries = value.entries.map(
        ([key, item]) => `${formatConsoleValue(key, true)} => ${formatConsoleValue(item, true)}`,
      );
      if (value.size > value.entries.length) entries.push('…');
      return `Map(${value.size}) {${entries.join(', ')}}`;
    }
    case 'set': {
      const items = value.items.map((item) => formatConsoleValue(item, true));
      if (value.size > value.items.length) items.push('…');
      return `Set(${value.size}) {${items.join(', ')}}`;
    }
    case 'typed':
      return `${value.ctor}(${value.length})`;
    case 'promise':
      return 'Promise';
    case 'weak':
      return value.ctor;
    case 'dom': {
      const id = value.id ? `#${value.id}` : '';
      const classes = value.className ? `.${value.className.trim().split(/\s+/).join('.')}` : '';
      return `<${value.tag}${id}${classes}>`;
    }
    case 'react':
      return `<${value.type} />`;
    case 'circular':
      return '[Circular]';
    case 'depth':
      return value.ctor === 'Array' ? '[…]' : `${value.ctor ? `${value.ctor} ` : ''}{…}`;
    case 'getter':
      return '(getter)';
    case 'unserializable':
      return `[${value.ctor ?? 'Object'}]`;
  }
}

/**
 * A whole console call as one line, honouring printf-style substitutions in a
 * leading string the way browsers do: `%s %d %i %f %o %O`, `%c` dropped (there
 * is no styling in a text preview) and `%%` for a literal percent sign.
 */
export function formatConsoleArgs(values: readonly SerializedValue[]): string {
  const [first, ...rest] = values;
  if (first === undefined) return '';
  if (first.t !== 'string' || !first.v.includes('%')) {
    return values.map((value) => formatConsoleValue(value)).join(' ');
  }

  let used = 0;
  const head = first.v.replace(/%([sdifoOc%])/g, (match, spec: string) => {
    if (spec === '%') return '%';
    const arg = rest[used];
    if (arg === undefined) return match;
    used++;
    switch (spec) {
      case 'c':
        return '';
      case 'd':
      case 'i':
        return arg.t === 'number' && typeof arg.v === 'number' ? String(Math.trunc(arg.v)) : 'NaN';
      case 'f':
        return arg.t === 'number' ? String(arg.v) : 'NaN';
      case 'o':
      case 'O':
        return formatConsoleValue(arg, true);
      default:
        return formatConsoleValue(arg);
    }
  });

  const tail = rest.slice(used).map((value) => formatConsoleValue(value));
  return [head, ...tail].join(' ');
}
