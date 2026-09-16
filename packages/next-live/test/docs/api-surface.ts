import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * The public API as the TypeScript compiler sees it, read from source.
 *
 * The docs are checked against this rather than against a hand-kept list,
 * because a hand-kept list drifts for exactly the reasons the docs do: someone
 * adds a prop, and nothing makes them update the second place.
 */

export const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const srcRoot = join(packageRoot, 'src');

export interface PropertyInfo {
  name: string;
  /** True when any member of the type leaves the property out or marks it `?`. */
  optional: boolean;
  /** Tagged `@internal`, so deliberately left out of the docs. */
  internal: boolean;
}

export interface ExportInfo {
  name: string;
  kind: 'value' | 'type';
  isClass: boolean;
  experimental: boolean;
}

export interface ParameterInfo {
  name: string;
  optional: boolean;
  rest: boolean;
}

export interface CallableInfo {
  /** One entry per overload, formatted as `(a: A, b?: B) => R`. */
  signatures: string[];
  /** The parameters of each overload, in the same order. */
  parameters: ParameterInfo[][];
}

export interface ForgottenExport {
  /** The public export whose declaration mentions the type. */
  usedBy: string;
  /** The type it mentions that no public entry exports. */
  typeName: string;
}

export interface ApiSurface {
  /** Public specifiers, e.g. `next-live`, `next-live/editor`. */
  entries: string[];
  exportsOf(entry: string): ExportInfo[];
  /** Properties of an exported interface, type alias, or class instance. */
  propertiesOf(entry: string, typeName: string): PropertyInfo[];
  /** Call signatures of an exported function, or null for anything else. */
  callableOf(entry: string, name: string): CallableInfo | null;
  /** The `extends` clause of an exported class, e.g. `extends Component<Props>`. */
  classHeritageOf(entry: string, name: string): string | null;
  /** The declared type of an exported constant, e.g. `ModuleRegistry`, or null for anything else. */
  constantTypeOf(entry: string, name: string): string | null;
  /** String literal members of an exported union type, e.g. an error code. */
  literalsOf(entry: string, typeName: string): string[];
  /**
   * Types that public declarations mention but no public entry exports.
   * Callers can see them in their editor and cannot import them.
   */
  forgottenExports(): ForgottenExport[];
}

/**
 * Public entries, derived from `package.json#exports` so a new entry is
 * checked the moment it ships. `internal/*` paths are implementation details
 * and say so in their name.
 */
export function publicEntries(): Map<string, string> {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
    name: string;
    exports: Record<string, unknown>;
  };
  const entries = new Map<string, string>();

  for (const key of Object.keys(manifest.exports)) {
    if (key === './package.json' || key.startsWith('./internal/')) continue;
    const base = key === '.' ? 'index' : key.slice(2);
    const file = ['.ts', '.tsx'].map((ext) => join(srcRoot, base + ext)).find((f) => existsSync(f));
    if (!file) throw new Error(`No source file for export "${key}" (looked for src/${base}.ts[x])`);
    entries.set(key === '.' ? manifest.name : `${manifest.name}/${base}`, file);
  }

  return entries;
}

const SIGNATURE_FLAGS =
  ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.WriteArrowStyleSignature;

export function loadApiSurface(): ApiSurface {
  const configPath = join(packageRoot, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, packageRoot);

  const entryFiles = publicEntries();
  const program = ts.createProgram({
    rootNames: [...entryFiles.values()],
    options: { ...parsed.options, noEmit: true },
  });
  const checker = program.getTypeChecker();

  const moduleSymbol = (entry: string): ts.Symbol => {
    const file = entryFiles.get(entry);
    if (!file) throw new Error(`Unknown entry "${entry}"`);
    const source = program.getSourceFile(file);
    const symbol = source && checker.getSymbolAtLocation(source);
    if (!symbol) throw new Error(`Could not read the module symbol of ${entry}`);
    return symbol;
  };

  const resolve = (symbol: ts.Symbol): ts.Symbol =>
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;

  const exported = (entry: string, name: string): ts.Symbol => {
    const symbol = checker.getExportsOfModule(moduleSymbol(entry)).find((s) => s.name === name);
    if (!symbol) throw new Error(`"${name}" is not exported from ${entry}`);
    return resolve(symbol);
  };

  const exportsOf = (entry: string): ExportInfo[] =>
    checker.getExportsOfModule(moduleSymbol(entry)).map((symbol) => {
      const target = resolve(symbol);
      return {
        name: symbol.name,
        kind: target.flags & ts.SymbolFlags.Value ? 'value' : 'type',
        isClass: Boolean(target.flags & ts.SymbolFlags.Class),
        experimental: hasTag(target, 'experimental'),
      };
    });

  const propertiesOf = (entry: string, typeName: string): PropertyInfo[] => {
    const type = checker.getDeclaredTypeOfSymbol(exported(entry, typeName));

    // A union (the runner state is one shape or the multi-file shape) documents
    // every member's fields, so collect across the members.
    const members = type.isUnion() ? type.types : [type];
    const byName = new Map<string, PropertyInfo>();

    for (const member of members) {
      for (const property of checker.getPropertiesOfType(member)) {
        // Only what next-live declares. A class inherits `message` and `stack`
        // from Error; those are the platform's to document, not ours.
        if (!declaredInSource(property)) continue;
        const previous = byName.get(property.name);
        byName.set(property.name, {
          name: property.name,
          optional:
            (previous?.optional ?? false) || Boolean(property.flags & ts.SymbolFlags.Optional),
          internal: (previous?.internal ?? false) || hasTag(property, 'internal'),
        });
      }
    }

    // A field some members lack is optional to the caller, whichever member
    // happened to declare it.
    if (members.length > 1) {
      for (const member of members) {
        const names = new Set(checker.getPropertiesOfType(member).map((p) => p.name));
        for (const info of byName.values()) if (!names.has(info.name)) info.optional = true;
      }
    }

    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  };

  const callableOf = (entry: string, name: string): CallableInfo | null => {
    const symbol = exported(entry, name);
    if (!(symbol.flags & ts.SymbolFlags.Function)) return null;
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
    if (!declaration) return null;

    const signatures = checker.getTypeOfSymbolAtLocation(symbol, declaration).getCallSignatures();
    return {
      signatures: signatures.map((s) => checker.signatureToString(s, undefined, SIGNATURE_FLAGS)),
      parameters: signatures.map((signature) =>
        signature.getParameters().map((parameter) => {
          const node = parameter.valueDeclaration as ts.ParameterDeclaration | undefined;
          return {
            name: parameter.name,
            optional: Boolean(node && checker.isOptionalParameter(node)),
            rest: Boolean(node?.dotDotDotToken),
          };
        }),
      ),
    };
  };

  const classHeritageOf = (entry: string, name: string): string | null => {
    const symbol = exported(entry, name);
    const declaration = symbol.declarations?.find(ts.isClassDeclaration);
    return declaration?.heritageClauses?.map((clause) => clause.getText()).join(' ') ?? null;
  };

  const constantTypeOf = (entry: string, name: string): string | null => {
    const symbol = exported(entry, name);
    const declaration = symbol.valueDeclaration;
    if (!declaration || !ts.isVariableDeclaration(declaration)) return null;
    return checker.typeToString(
      checker.getTypeOfSymbolAtLocation(symbol, declaration),
      undefined,
      ts.TypeFormatFlags.NoTruncation,
    );
  };

  const literalsOf = (entry: string, typeName: string): string[] => {
    const type = checker.getDeclaredTypeOfSymbol(exported(entry, typeName));
    const members = type.isUnion() ? type.types : [type];
    return members.filter((m) => m.isStringLiteral()).map((m) => (m as ts.StringLiteralType).value);
  };

  const forgottenExports = (): ForgottenExport[] => {
    const exportedSymbols = new Set<ts.Symbol>();
    const roots: { name: string; symbol: ts.Symbol }[] = [];
    for (const entry of entryFiles.keys()) {
      for (const symbol of checker.getExportsOfModule(moduleSymbol(entry))) {
        const target = resolve(symbol);
        exportedSymbols.add(target);
        roots.push({ name: `${entry}#${symbol.name}`, symbol: target });
      }
    }

    const found = new Map<string, ForgottenExport>();
    for (const { name, symbol } of roots) {
      for (const declaration of symbol.declarations ?? []) {
        if (!isInSource(declaration)) continue;
        visitPublicTypeNodes(declaration, (node) => {
          const target = referencedSymbol(checker, node);
          if (!target || exportedSymbols.has(target) || !declaredInSource(target)) return;
          // A type parameter (`T`) is local to its signature, not a missing export.
          if (target.flags & ts.SymbolFlags.TypeParameter) return;
          found.set(`${name}:${target.name}`, { usedBy: name, typeName: target.name });
        });
      }
    }
    return [...found.values()];
  };

  return {
    entries: [...entryFiles.keys()],
    exportsOf,
    propertiesOf,
    callableOf,
    classHeritageOf,
    constantTypeOf,
    literalsOf,
    forgottenExports,
  };
}

/**
 * Walks only the parts of a declaration a caller can see: parameter and return
 * types, interface members, type alias bodies, public class members. Function
 * bodies are implementation and are skipped.
 */
function visitPublicTypeNodes(declaration: ts.Node, visit: (node: ts.TypeReferenceNode | ts.ImportTypeNode | ts.ExpressionWithTypeArguments) => void): void {
  const walkType = (node: ts.Node | undefined): void => {
    if (!node) return;
    if (ts.isTypeReferenceNode(node) || ts.isImportTypeNode(node) || ts.isExpressionWithTypeArguments(node)) {
      visit(node);
    }
    ts.forEachChild(node, walkType);
  };

  const walkSignature = (node: ts.SignatureDeclaration): void => {
    node.typeParameters?.forEach((p) => {
      walkType(p.constraint);
      walkType(p.default);
    });
    node.parameters.forEach((p) => walkType(p.type));
    walkType(node.type);
  };

  if (ts.isFunctionDeclaration(declaration)) walkSignature(declaration);
  else if (ts.isInterfaceDeclaration(declaration)) {
    declaration.heritageClauses?.forEach(walkType);
    declaration.members.forEach(walkType);
  } else if (ts.isTypeAliasDeclaration(declaration)) walkType(declaration.type);
  else if (ts.isVariableDeclaration(declaration)) walkType(declaration.type);
  else if (ts.isClassDeclaration(declaration)) {
    declaration.heritageClauses?.forEach(walkType);
    for (const member of declaration.members) {
      const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
      const hidden = modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword,
      );
      if (hidden || (member.name && ts.isPrivateIdentifier(member.name))) continue;
      if (ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member)) walkSignature(member);
      else if (ts.isPropertyDeclaration(member)) walkType(member.type);
    }
  }
}

function referencedSymbol(
  checker: ts.TypeChecker,
  node: ts.TypeReferenceNode | ts.ImportTypeNode | ts.ExpressionWithTypeArguments,
): ts.Symbol | undefined {
  const location = ts.isTypeReferenceNode(node)
    ? node.typeName
    : ts.isImportTypeNode(node)
      ? node.qualifier
      : node.expression;
  if (!location) return undefined;
  const symbol = checker.getSymbolAtLocation(location);
  if (!symbol) return undefined;
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function isInSource(node: ts.Node): boolean {
  const path = relative(srcRoot, node.getSourceFile().fileName);
  return !path.startsWith('..') && !path.startsWith(sep);
}

function declaredInSource(symbol: ts.Symbol): boolean {
  return (symbol.declarations ?? []).some(isInSource);
}

function hasTag(symbol: ts.Symbol, tag: string): boolean {
  return (symbol.declarations ?? []).some((declaration) =>
    ts.getJSDocTags(declaration).some((t) => t.tagName.text === tag),
  );
}

// ---------------------------------------------------------------------------
// Signature text
// ---------------------------------------------------------------------------

/**
 * Brings a hand-written signature and a compiler-printed one to the same form,
 * so only a difference in meaning fails the comparison:
 *
 * - `function f(a: A): R` and `(a: A) => R` are the same signature.
 * - The compiler adds `| undefined` to optional members; people do not.
 * - Whitespace, quote style, and a trailing `;` inside `{ }` do not matter.
 * - `typeof import("/abs/node_modules/pkg/dist/x")` is `typeof import("pkg")`.
 */
export function normalizeSignature(text: string, name?: string): string {
  let result = text.trim();

  if (name !== undefined) {
    const declaration = new RegExp(`^function\\s+${escapeRegExp(name)}\\s*`);
    if (declaration.test(result)) result = arrowStyle(result.replace(declaration, ''));
    result = result.replace(new RegExp(`^const\\s+${escapeRegExp(name)}\\s*:\\s*`), '');
  }

  result = result
    .replace(/import\((['"])[^'"]*node_modules\/((?:@[^/'"]+\/)?[^/'"]+)[^'"]*\1\)/g, 'import("$2")')
    .replace(/'/g, '"')
    .replace(/\s+/g, ' ');

  result = stripOptionalUndefined(result);

  return result
    .replace(/;\s*}/g, ' }')
    .replace(/\{\s*/g, '{ ')
    .replace(/\s*}/g, ' }')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `<T>(a: A): R` to `<T>(a: A) => R`, using the parameter list's closing paren. */
function arrowStyle(signature: string): string {
  let i = 0;
  if (signature.startsWith('<')) i = matchingClose(signature, 0);
  const open = signature.indexOf('(', i);
  if (open === -1) return signature;
  const close = matchingClose(signature, open);
  const rest = signature.slice(close + 1);
  const returnType = /^\s*:\s*/.exec(rest);
  return returnType
    ? `${signature.slice(0, close + 1)} => ${rest.slice(returnType[0].length)}`
    : signature;
}

function matchingClose(text: string, openIndex: number): number {
  const pairs: Record<string, string> = { '(': ')', '<': '>', '{': '}', '[': ']' };
  const stack: string[] = [];
  for (let i = openIndex; i < text.length; i++) {
    const char = text[i] as string;
    if (char === '>' && text[i - 1] === '=') continue;
    if (pairs[char]) stack.push(pairs[char] as string);
    else if (char === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return i;
    }
  }
  throw new Error(`Unbalanced brackets in signature: ${text}`);
}

/** Removes the `| undefined` the compiler appends to an optional member or parameter. */
function stripOptionalUndefined(text: string): string {
  const out: string[] = [];
  const frames: { optional: boolean; start: number }[] = [{ optional: false, start: 0 }];
  const closers = new Set([')', '>', '}', ']']);
  const openers = new Set(['(', '<', '{', '[']);

  const endMember = () => {
    const frame = frames[frames.length - 1] as { optional: boolean; start: number };
    if (frame.optional) {
      const segment = out.splice(frame.start).join('').replace(/\s*\|\s*undefined(\s*)$/, '$1');
      out.push(...segment);
    }
    frame.optional = false;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string;
    const isArrow = char === '>' && text[i - 1] === '=';

    if (char === '?' && text[i + 1] === ':') {
      (frames[frames.length - 1] as { optional: boolean }).optional = true;
    }

    if ((char === ';' || char === ',') && frames.length > 0) {
      endMember();
      out.push(char);
      (frames[frames.length - 1] as { start: number }).start = out.length;
      continue;
    }
    if (closers.has(char) && !isArrow && frames.length > 1) {
      endMember();
      frames.pop();
      out.push(char);
      continue;
    }

    out.push(char);
    if (openers.has(char)) frames.push({ optional: false, start: out.length });
  }
  endMember();
  return out.join('');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
