import * as React from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import * as JsxDevRuntime from 'react/jsx-dev-runtime';
import type { ModuleRegistry } from './types';

/**
 * Modules every snippet can import without the host registering anything.
 *
 * The two JSX runtimes are not optional: with `jsxRuntime: 'automatic'`
 * Sucrase compiles every JSX element into a `react/jsx-runtime` (or
 * `react/jsx-dev-runtime`) call, so without these entries *every* snippet
 * fails on its first tag.
 *
 * These are static imports so evaluated code shares the host's single React
 * instance — hooks and context work across the boundary, which is the whole
 * point of evaluating in the host realm. Host `modules` merge over these, so
 * a React shim can still be substituted.
 *
 * `react-dom` is deliberately absent: snippets rarely need it, and a host that
 * does can register it explicitly.
 */
export const builtinModules: ModuleRegistry = {
  react: React,
  'react/jsx-runtime': JsxRuntime,
  'react/jsx-dev-runtime': JsxDevRuntime,
};
