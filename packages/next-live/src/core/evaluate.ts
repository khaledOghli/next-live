import * as React from 'react';
import { LiveCompileError, LiveRuntimeError, NoComponentError } from './errors';
import { scanTopLevelDeclarations } from './transpile';
import type {
  ExtractionSource,
  LiveRenderable,
  LiveScope,
  NormalizedModule,
} from './types';

/** Wrapper parameters a scope key may not shadow. */
const RESERVED = new Set(['module', 'exports', 'require', 'React', 'render', '__liveTick']);

const JS_RESERVED_WORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally',
  'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'null',
  'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof',
  'var', 'void', 'while', 'with', 'yield', 'let', 'static', 'implements',
  'interface', 'package', 'private', 'protected', 'public', 'arguments', 'eval',
]);

const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/;

/**
 * Scope keys that can legally become function parameters, sorted so the
 * generated source - and therefore any cache key built from it, is stable
 * regardless of object key order.
 *
 * Unusable keys are warned about rather than thrown on: a host merging a large
 * scope object should not lose the whole preview over one bad key.
 */
export function usableScopeKeys(scope: LiveScope): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(scope)) {
    if (!IDENTIFIER_RE.test(key) || JS_RESERVED_WORDS.has(key)) {
      warn(`next-live: scope key ${JSON.stringify(key)} is not a valid identifier and was skipped.`);
      continue;
    }
    if (RESERVED.has(key)) {
      warn(`next-live: scope key "${key}" is reserved by next-live and was skipped.`);
      continue;
    }
    keys.push(key);
  }
  return keys.sort();
}

function warn(message: string): void {
  if (typeof console !== 'undefined') console.warn(message);
}

export interface EvaluateOptions {
  code: string;
  filePath: string;
  require: (specifier: string) => NormalizedModule;
  scope: LiveScope;
  /** Injected as `__liveTick` when the source was instrumented for render budgeting. */
  liveTick?: () => void;
  /**
   * Injected as `console` while capture is on. Omitted otherwise, so the
   * snippet sees the real console and the generated wrapper is unchanged.
   */
  console?: object;
  /**
   * The module record to evaluate into. A multi-file project passes the one it
   * has already put in its require cache, so a circular import sees it.
   */
  module?: { exports: Record<string, unknown> };
  /**
   * Recover an unexported component as the default export. Only a project's
   * entry file does; for any other file an unexported declaration is private.
   * Default true.
   */
  recoverDefault?: boolean;
  /** Replaces the injected `render()` helper. */
  render?: (node: unknown) => void;
}

export interface EvaluateResult {
  renderable: LiveRenderable;
  via: ExtractionSource;
}

/**
 * Evaluates compiled snippet code in the host realm and extracts something
 * renderable from it.
 *
 * The wrapper contributes **zero characters before the user's code**, which is
 * what keeps error line numbers a simple subtraction: everything the snippet
 * needs arrives as a function parameter, and parameters cost no lines. The
 * epilogue and `sourceURL` comment go after the code, where added lines are
 * harmless.
 */
export function evaluate(options: EvaluateOptions): EvaluateResult {
  const { exports, rendered, recovered } = runModule(options);

  return pickRenderable(exports, rendered, recovered);
}

export interface ModuleResult {
  /** Everything the snippet exported. */
  exports: Record<string, unknown>;
  /** Present only when the snippet called the injected `render()` helper. */
  rendered?: { rendered: unknown };
  /**
   * True when the default export came from the recovery epilogue rather than
   * from the author. Recorded on the module object, which never leaves this
   * function, so a snippet's own `exports` stay clean for `compileModule`.
   */
  recovered?: boolean;
}

/**
 * Runs a snippet and returns its raw exports, without insisting that it
 * produced a React component.
 *
 * Plenty of stored code is not UI - validators, transformers, calculated
 * fields, config builders. Those are perfectly good modules, and asking them
 * to export a component would be nonsense.
 */
export function runModule(options: EvaluateOptions): ModuleResult {
  const { code, filePath, require: requireFn, liveTick, console: consoleProxy } = options;
  const tick =
    liveTick ?? (code.includes('__liveTick') ? () => {} : undefined);

  // Snippet code is strict mode, where a duplicate parameter name is a
  // SyntaxError. While capturing, the proxy owns `console`, and a
  // `scope.console` has already been made its forward target.
  const scope =
    consoleProxy !== undefined && Object.prototype.hasOwnProperty.call(options.scope, 'console')
      ? Object.fromEntries(Object.entries(options.scope).filter(([key]) => key !== 'console'))
      : options.scope;

  const scopeKeys = usableScopeKeys(scope);
  const epilogue = options.recoverDefault === false ? '' : buildEpilogue(code);
  // `sourceURL` makes every frame from this snippet identifiable, so stacks can
  // be filtered down to user code and DevTools shows a stable file name.
  const body = `${code}\n${epilogue}\n//# sourceURL=next-live:///${filePath}`;

  const moduleObject: { exports: Record<string, unknown>; __nextLiveRecovered?: boolean } =
    options.module ?? { exports: Object.create(null) as Record<string, unknown> };

  let rendered: unknown;
  let didRender = false;
  const render =
    options.render ??
    ((node: unknown): void => {
      rendered = node;
      didRender = true;
    });

  const paramNames = ['module', 'exports', 'require', 'React', 'render'];
  const paramValues: unknown[] = [
    moduleObject,
    moduleObject.exports,
    requireFn,
    React,
    render,
  ];

  if (tick) {
    paramNames.push('__liveTick');
    paramValues.push(tick);
  }

  if (consoleProxy !== undefined) {
    paramNames.push('console');
    paramValues.push(consoleProxy);
  }

  paramNames.push(...scopeKeys);
  paramValues.push(...scopeKeys.map((key) => scope[key]));

  let factory: (...args: unknown[]) => void;
  try {
    factory = new Function(...paramNames, body) as (...args: unknown[]) => void;
  } catch (cause) {
    if (isCspEvalBlock(cause)) throw cspError(cause);
    throw new LiveRuntimeError(
      cause instanceof Error ? cause.message : String(cause),
      { cause },
    );
  }

  factory(...paramValues);

  return {
    exports: moduleObject.exports,
    ...(didRender ? { rendered: { rendered } } : {}),
    ...(moduleObject.__nextLiveRecovered === true ? { recovered: true } : {}),
  };
}

/**
 * Recovers `export default` for snippets that declare a component without
 * exporting it (legacy inline authoring style).
 *
 * Emitted only when the code exports nothing, and every name is `typeof`
 * guarded so a false positive from the declaration scan cannot throw.
 * Candidates are tried in reverse declaration order so the last component
 * defined wins, which matches how people write these snippets.
 */
function buildEpilogue(code: string): string {
  if (/\bexports\./.test(code)) return '';

  const declarations = scanTopLevelDeclarations(code);
  if (declarations.length === 0) return '';

  const ranked = rankCandidates(declarations);
  return ranked
    .map(
      (name) =>
        `;if(!('default' in exports)){try{if(typeof ${name}!=='undefined'){exports.default=${name};module.__nextLiveRecovered=true}}catch(e){}}`,
    )
    .join('');
}

const PREFERRED_NAMES = ['App', 'Component', 'Main', 'Demo', 'Example', 'Page'];

function rankCandidates(names: string[]): string[] {
  const preferred = names.filter((name) => PREFERRED_NAMES.includes(name));
  // PascalCase is React's own convention for components, so prefer those over
  // helper functions that happen to be declared later.
  const pascal = names.filter(
    (name) => !preferred.includes(name) && /^[A-Z]/.test(name),
  );
  const rest = names.filter(
    (name) => !preferred.includes(name) && !pascal.includes(name),
  );
  return [...preferred, ...pascal.reverse(), ...rest.reverse()];
}

/**
 * Chooses what to render from a snippet's exports, in the order a reader would
 * expect it to be found.
 */
export function pickRenderable(
  exports: Record<string, unknown>,
  renderCall?: { rendered: unknown },
  recovered?: boolean,
): EvaluateResult {
  if (renderCall) {
    const found = asRenderable(renderCall.rendered);
    if (found) return { renderable: found, via: 'render()' };
    throw new NoComponentError(
      'render() was called with something React cannot render.',
    );
  }

  // `module.exports = Component` replaces the exports object wholesale, so the
  // record handed in here *is* the component. Sucrase's ESM output never does
  // that, which is why this is checked ahead of the named-export scan rather
  // than as part of it - and why `ExtractionSource` has a 'module.exports'
  // member at all.
  const asCommonJs = asRenderable(exports);
  if (asCommonJs) return { renderable: asCommonJs, via: 'module.exports' };

  const defaultExport = exports['default'];
  if (defaultExport !== undefined) {
    const found = asRenderable(defaultExport);
    // A recovered default was synthesised by the epilogue, not written by the
    // author - saying 'export default' would misreport it in error messages.
    if (found) return { renderable: found, via: recovered ? 'declaration' : 'export default' };
    throw new NoComponentError(
      `The default export is ${describe(defaultExport)}, which React cannot render. ` +
        'Export a component or an element instead.',
    );
  }

  const named = Object.keys(exports).filter((key) => key !== '__esModule');
  const renderableNames = named.filter((key) => asRenderable(exports[key]) !== null);

  if (renderableNames.length === 1) {
    const only = renderableNames[0] as string;
    return { renderable: asRenderable(exports[only]) as LiveRenderable, via: 'named export' };
  }

  if (renderableNames.length > 1) {
    const preferred = PREFERRED_NAMES.find((name) => renderableNames.includes(name));
    if (preferred) {
      return {
        renderable: asRenderable(exports[preferred]) as LiveRenderable,
        via: 'named export',
      };
    }
    throw new NoComponentError(
      `Several components were exported (${renderableNames.join(', ')}) and none is the ` +
        'default. Add `export default` to the one you want rendered.',
    );
  }

  throw new NoComponentError(
    named.length > 0
      ? `Nothing renderable was exported. Found: ${named.join(', ')}. ` +
        'Add `export default YourComponent`.'
      : 'The snippet did not produce a component. Add `export default YourComponent`, ' +
        'or end the snippet with a single JSX expression.',
  );
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

function asRenderable(value: unknown): LiveRenderable | null {
  if (isReactElement(value)) return { kind: 'element', element: value };
  if (isRenderableComponent(value)) {
    return { kind: 'component', component: value as React.ComponentType<Record<string, unknown>> };
  }
  return null;
}

const symbolFor = (name: string): symbol | string =>
  typeof Symbol === 'function' && Symbol.for ? Symbol.for(name) : name;

/** Exotic component objects that are valid as a JSX element type. */
const COMPONENT_TYPES = new Set<unknown>([
  symbolFor('react.memo'),
  symbolFor('react.forward_ref'),
  symbolFor('react.lazy'),
  symbolFor('react.provider'),
  symbolFor('react.context'),
  symbolFor('react.suspense'),
  symbolFor('react.suspense_list'),
  symbolFor('react.fragment'),
  symbolFor('react.profiler'),
  symbolFor('react.client.reference'),
]);

const ELEMENT_TYPES = new Set<unknown>([
  symbolFor('react.transitional.element'), // React 19
  symbolFor('react.element'), // React 18 and interop
  symbolFor('react.portal'),
]);

/**
 * Whether React can use this as a component type.
 *
 * Plain functions pass, which means a utility function is indistinguishable
 * from a component here - that case fails loudly at render with React's own
 * error, which is clearer than anything we could say. The check exists mainly
 * so `export default memo(App)` and `forwardRef` components are not rejected.
 */
export function isRenderableComponent(value: unknown): boolean {
  if (typeof value === 'function') return true;
  if (typeof value !== 'object' || value === null) return false;
  return COMPONENT_TYPES.has((value as { $$typeof?: unknown }).$$typeof);
}

export function isReactElement(value: unknown): value is React.ReactElement {
  if (typeof value !== 'object' || value === null) return false;
  return ELEMENT_TYPES.has((value as { $$typeof?: unknown }).$$typeof);
}

/**
 * Whether a thrown value is the browser refusing `new Function` under a
 * Content Security Policy.
 *
 * Checked by type *and* message: `EvalError` is what every current engine
 * throws, but the wording differs between them, and a future engine could pick
 * a different error type. Either signal is enough.
 */
function isCspEvalBlock(cause: unknown): boolean {
  if (cause instanceof EvalError) return true;
  const message = cause instanceof Error ? cause.message : String(cause);
  return /unsafe-eval|Refused to evaluate|call to eval/i.test(message);
}

/**
 * The raw engine message ("Refused to evaluate a string as JavaScript…") says
 * nothing about what to change, and this is the single most likely thing to go
 * wrong on a first production deploy - so it gets an explicit fix.
 */
function cspError(cause: unknown): LiveCompileError {
  return new LiveCompileError(
    "next-live could not evaluate this snippet: the page's Content Security " +
      "Policy blocks eval.\n\n" +
      "Add 'unsafe-eval' to script-src for the routes that run snippets " +
      '(in proxy.ts). This is expected - next-live compiles code at runtime, ' +
      'so there is no way around the directive.\n\n' +
      "Note that 'unsafe-eval' does not allow loading external scripts, and it " +
      'does not need to apply to your whole application.',
    undefined,
    cause,
  );
}
