/**
 * A clone-safe description of an arbitrary value, for showing it somewhere
 * other than DevTools: a console panel, or the far side of a `postMessage`.
 *
 * Deliberately React-free and DOM-optional, so the sandbox runtime and the
 * console entry can both use it without pulling anything else in.
 */
export type SerializedValue =
  | { t: 'undefined' }
  | { t: 'null' }
  | { t: 'boolean'; v: boolean }
  | { t: 'number'; v: number | 'NaN' | 'Infinity' | '-Infinity' | '-0' }
  | { t: 'string'; v: string; truncated?: number }
  | { t: 'bigint'; v: string }
  | { t: 'symbol'; v: string }
  | { t: 'function'; name: string; kind: 'function' | 'class' | 'async' | 'generator' }
  | { t: 'error'; name: string; message: string; stack?: string; cause?: SerializedValue }
  | { t: 'date'; v: string }
  | { t: 'regexp'; v: string }
  | { t: 'array'; items: SerializedValue[]; length: number }
  | { t: 'object'; ctor?: string; entries: Array<[string, SerializedValue]>; more?: number }
  | { t: 'map'; size: number; entries: Array<[SerializedValue, SerializedValue]> }
  | { t: 'set'; size: number; items: SerializedValue[] }
  | { t: 'typed'; ctor: string; length: number }
  | { t: 'promise' }
  | { t: 'weak'; ctor: string }
  | { t: 'dom'; tag: string; id?: string; className?: string; text?: string }
  | { t: 'react'; type: string; key: string | null; props: SerializedValue }
  | { t: 'circular' }
  | { t: 'depth'; ctor?: string }
  | { t: 'getter' }
  | { t: 'unserializable'; ctor?: string };

export interface SerializeOptions {
  /** Nesting below which containers are summarised. Default 4. */
  maxDepth?: number;
  /** Object keys listed per object. Default 100. */
  maxKeys?: number;
  /** Array, Map and Set members listed per container. Default 100. */
  maxItems?: number;
  /** Characters kept per string. Default 10 000. */
  maxString?: number;
  /** Values visited in total, across every argument. Default 2 000. */
  maxNodes?: number;
}

const DEFAULTS: Required<SerializeOptions> = {
  maxDepth: 4,
  maxKeys: 100,
  maxItems: 100,
  maxString: 10_000,
  maxNodes: 2_000,
};

const REACT_ELEMENT_TYPES = new Set<unknown>([
  Symbol.for('react.transitional.element'),
  Symbol.for('react.element'),
  Symbol.for('react.portal'),
]);

const toTag = (value: object): string => Object.prototype.toString.call(value);

/** Serializes one value. */
export function serializeValue(value: unknown, options?: SerializeOptions): SerializedValue {
  return createSerializer(options)(value);
}

/**
 * Serializes a list of values - typically a `console.log` call's arguments -
 * sharing one node budget, so a call with many large arguments stays bounded.
 */
export function serializeValues(
  values: readonly unknown[],
  options?: SerializeOptions,
): SerializedValue[] {
  const visit = createSerializer(options);
  return values.map((value) => visit(value));
}

function createSerializer(options?: SerializeOptions): (value: unknown) => SerializedValue {
  const limits = { ...DEFAULTS, ...options };
  // Ancestors, not every object seen: a value referenced twice side by side is
  // not a cycle and should print in full both times.
  const ancestors = new Set<object>();
  let nodes = 0;

  const visit = (value: unknown, depth: number): SerializedValue => {
    nodes++;

    switch (typeof value) {
      case 'undefined':
        return { t: 'undefined' };
      case 'boolean':
        return { t: 'boolean', v: value };
      case 'number':
        return { t: 'number', v: serializeNumber(value) };
      case 'string':
        return serializeString(value, limits.maxString);
      case 'bigint':
        return { t: 'bigint', v: value.toString() };
      case 'symbol':
        return { t: 'symbol', v: value.description ?? '' };
      case 'function':
        return serializeFunction(value);
    }
    if (value === null) return { t: 'null' };

    const object = value as object;
    try {
      if (ancestors.has(object)) return { t: 'circular' };

      const leaf = serializeLeaf(object, limits.maxString);
      if (leaf) return leaf;

      if (depth >= limits.maxDepth || nodes > limits.maxNodes) {
        // Same convention as full objects: plain `Object` goes unnamed.
        const ctor = constructorName(object);
        return ctor && ctor !== 'Object' ? { t: 'depth', ctor } : { t: 'depth' };
      }

      ancestors.add(object);
      try {
        return serializeContainer(object, depth, limits, visit);
      } finally {
        ancestors.delete(object);
      }
    } catch {
      // A revoked Proxy, a throwing `ownKeys` trap, a cross-origin window.
      const ctor = safeConstructorName(object);
      return ctor ? { t: 'unserializable', ctor } : { t: 'unserializable' };
    }
  };

  return (value) => visit(value, 0);
}

function serializeNumber(value: number): Extract<SerializedValue, { t: 'number' }>['v'] {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
  if (Object.is(value, -0)) return '-0';
  return value;
}

function serializeString(value: string, max: number): SerializedValue {
  return value.length > max
    ? { t: 'string', v: value.slice(0, max), truncated: value.length }
    : { t: 'string', v: value };
}

function serializeFunction(fn: unknown): SerializedValue {
  let name = '';
  let kind: 'function' | 'class' | 'async' | 'generator' = 'function';
  try {
    const descriptor = Object.getOwnPropertyDescriptor(fn, 'name');
    if (typeof descriptor?.value === 'string') name = descriptor.value;

    const tag = toTag(fn as object);
    if (tag === '[object AsyncFunction]') kind = 'async';
    else if (tag === '[object GeneratorFunction]' || tag === '[object AsyncGeneratorFunction]') {
      kind = 'generator';
    } else if (/^class[\s{]/.test(Function.prototype.toString.call(fn))) {
      kind = 'class';
    }
  } catch {
    // Proxied functions can refuse `toString`; the defaults are fine.
  }
  return { t: 'function', name, kind };
}

/** Values with no children worth walking. */
function serializeLeaf(object: object, maxString: number): SerializedValue | null {
  const tag = toTag(object);

  switch (tag) {
    case '[object Date]': {
      const time = Date.prototype.getTime.call(object);
      return {
        t: 'date',
        v: Number.isNaN(time) ? 'Invalid Date' : Date.prototype.toISOString.call(object),
      };
    }
    case '[object RegExp]':
      return { t: 'regexp', v: RegExp.prototype.toString.call(object) };
    case '[object Promise]':
      return { t: 'promise' };
    case '[object WeakMap]':
    case '[object WeakSet]':
    case '[object WeakRef]':
      return { t: 'weak', ctor: tag.slice(8, -1) };
    case '[object ArrayBuffer]':
    case '[object SharedArrayBuffer]':
      return {
        t: 'typed',
        ctor: tag.slice(8, -1),
        length: (object as ArrayBuffer).byteLength,
      };
  }

  if (ArrayBuffer.isView(object)) {
    const length = (object as { length?: unknown }).length;
    return {
      t: 'typed',
      ctor: constructorName(object) ?? tag.slice(8, -1),
      length: typeof length === 'number' ? length : object.byteLength,
    };
  }

  if (typeof Node === 'function' && object instanceof Node) {
    return serializeDomNode(object, maxString);
  }

  return null;
}

function serializeDomNode(node: Node, maxString: number): SerializedValue {
  const text = (node.textContent ?? '').trim().slice(0, Math.min(80, maxString));
  if (node.nodeType === 1) {
    const element = node as Element;
    return {
      t: 'dom',
      tag: element.localName,
      ...(element.id ? { id: element.id } : {}),
      // SVG elements expose an SVGAnimatedString here, not a string.
      ...(typeof element.className === 'string' && element.className
        ? { className: element.className }
        : {}),
      ...(text ? { text } : {}),
    };
  }
  return { t: 'dom', tag: node.nodeName, ...(text ? { text } : {}) };
}

function serializeContainer(
  object: object,
  depth: number,
  limits: Required<SerializeOptions>,
  visit: (value: unknown, depth: number) => SerializedValue,
): SerializedValue {
  const next = depth + 1;
  const tag = toTag(object);

  if (tag === '[object Error]' || tag === '[object DOMException]') {
    const error = object as Error;
    const causeDescriptor = Object.getOwnPropertyDescriptor(error, 'cause');
    return {
      t: 'error',
      name: String(error.name),
      message: String(error.message).slice(0, limits.maxString),
      ...(typeof error.stack === 'string' ? { stack: error.stack.slice(0, limits.maxString) } : {}),
      ...(causeDescriptor && 'value' in causeDescriptor
        ? { cause: visit(causeDescriptor.value, next) }
        : {}),
    };
  }

  const typeOf = Object.getOwnPropertyDescriptor(object, '$$typeof')?.value;
  if (REACT_ELEMENT_TYPES.has(typeOf)) {
    const element = object as { type?: unknown; key?: unknown; props?: unknown };
    return {
      t: 'react',
      type: reactTypeName(element.type),
      key: typeof element.key === 'string' ? element.key : null,
      props: visit(element.props, next),
    };
  }

  if (Array.isArray(object)) {
    const count = Math.min(object.length, limits.maxItems);
    const items: SerializedValue[] = [];
    for (let i = 0; i < count; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(object, i);
      items.push(
        descriptor === undefined
          ? { t: 'undefined' }
          : 'value' in descriptor
            ? visit(descriptor.value, next)
            : { t: 'getter' },
      );
    }
    return { t: 'array', items, length: object.length };
  }

  if (tag === '[object Map]') {
    const map = object as Map<unknown, unknown>;
    const entries: Array<[SerializedValue, SerializedValue]> = [];
    for (const [key, value] of Map.prototype.entries.call(map)) {
      if (entries.length >= limits.maxItems) break;
      entries.push([visit(key, next), visit(value, next)]);
    }
    return { t: 'map', size: map.size, entries };
  }

  if (tag === '[object Set]') {
    const set = object as Set<unknown>;
    const items: SerializedValue[] = [];
    for (const value of Set.prototype.values.call(set)) {
      if (items.length >= limits.maxItems) break;
      items.push(visit(value, next));
    }
    return { t: 'set', size: set.size, items };
  }

  // Plain and class-instance objects. Descriptors, never property reads, so a
  // getter with side effects is listed rather than run.
  const descriptors = Object.getOwnPropertyDescriptors(object);
  const keys = Object.keys(descriptors).filter((key) => descriptors[key]?.enumerable);
  const entries: Array<[string, SerializedValue]> = [];
  for (const key of keys.slice(0, limits.maxKeys)) {
    const descriptor = descriptors[key] as PropertyDescriptor;
    entries.push([key, 'value' in descriptor ? visit(descriptor.value, next) : { t: 'getter' }]);
  }

  const ctor = constructorName(object);
  const more = keys.length - entries.length;
  return {
    t: 'object',
    ...(ctor && ctor !== 'Object' ? { ctor } : {}),
    entries,
    ...(more > 0 ? { more } : {}),
  };
}

function reactTypeName(type: unknown): string {
  if (typeof type === 'string') return type;
  if (typeof type === 'symbol') return type.description?.replace(/^react\./, '') ?? 'Unknown';
  if (typeof type === 'function' || (typeof type === 'object' && type !== null)) {
    const candidate = type as { displayName?: unknown; name?: unknown; render?: { name?: unknown } };
    for (const name of [candidate.displayName, candidate.name, candidate.render?.name]) {
      if (typeof name === 'string' && name) return name;
    }
  }
  return 'Anonymous';
}

/** Reads the constructor name through descriptors, so no getter runs. */
function constructorName(object: object): string | undefined {
  const proto = Object.getPrototypeOf(object) as object | null;
  if (proto === null) return undefined;
  const ctor = Object.getOwnPropertyDescriptor(proto, 'constructor')?.value as unknown;
  if (typeof ctor !== 'function') return undefined;
  const name = Object.getOwnPropertyDescriptor(ctor, 'name')?.value as unknown;
  return typeof name === 'string' && name ? name : undefined;
}

function safeConstructorName(object: object): string | undefined {
  try {
    return constructorName(object);
  } catch {
    return undefined;
  }
}
