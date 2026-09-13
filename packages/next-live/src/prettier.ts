'use client';

import type { FormatFn } from './editor/format';

export interface PrettierFormatterOptions {
  printWidth?: number;
  tabWidth?: number;
  useTabs?: boolean;
  semi?: boolean;
  singleQuote?: boolean;
}

type PrettierLoad = typeof import('prettier/standalone');

let prettierPromise: Promise<PrettierLoad> | null = null;

async function loadPrettier(): Promise<PrettierLoad> {
  if (!prettierPromise) {
    prettierPromise = import('prettier/standalone').catch((cause) => {
      prettierPromise = null;
      throw cause;
    });
  }
  return prettierPromise;
}

function parserForLanguage(language: string): 'typescript' | 'babel' | null {
  const lang = language.toLowerCase();
  if (lang === 'tsx' || lang === 'ts' || lang === 'typescript') return 'typescript';
  if (lang === 'jsx' || lang === 'js' || lang === 'javascript') return 'babel';
  return null;
}

/**
 * Lazy-loads Prettier and returns a formatter for `<LiveEditor format={…}>`.
 */
export function createPrettierFormatter(options: PrettierFormatterOptions = {}): FormatFn {
  return async (code, ctx) => {
    const parser = parserForLanguage(ctx.language);
    if (parser === null) {
      throw new Error(`Prettier formatting is not supported for language "${ctx.language}".`);
    }

    const prettier = await loadPrettier();

    const pluginImports =
      parser === 'typescript'
        ? [import('prettier/plugins/typescript'), import('prettier/plugins/estree')]
        : [import('prettier/plugins/babel'), import('prettier/plugins/estree')];

    const pluginMods = await Promise.all(pluginImports);
    const plugins = pluginMods.map((mod) => ('default' in mod ? mod.default : mod));

    const result = await prettier.formatWithCursor(code, {
      parser,
      plugins,
      cursorOffset: ctx.cursorOffset,
      printWidth: options.printWidth ?? 80,
      tabWidth: options.tabWidth ?? 2,
      useTabs: options.useTabs ?? false,
      semi: options.semi ?? true,
      singleQuote: options.singleQuote ?? false,
    });

    return { code: result.formatted, cursorOffset: result.cursorOffset };
  };
}
