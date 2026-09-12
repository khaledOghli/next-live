// Components. Exported as named bindings, never as static properties on a
// parent (`Live.Preview`): across the RSC boundary a Server Component receives
// a client *reference*, so any attached property resolves to undefined.
export { LiveProvider } from './components/LiveProvider';
export type { LiveProviderProps } from './components/LiveProvider';
export { LiveEditor } from './components/LiveEditor';
export type { LiveEditorProps, LiveEditorRenderProps } from './components/LiveEditor';
export { LivePreview } from './components/LivePreview';
export type { LivePreviewProps } from './components/LivePreview';
export { LiveError } from './components/LiveError';
export type { LiveErrorProps } from './components/LiveError';
export { LiveErrorBoundary } from './components/LiveErrorBoundary';
export type { LiveErrorBoundaryProps } from './components/LiveErrorBoundary';

// Hooks and context, for hosts building their own UI.
export { useLiveRunner } from './hooks/useLiveRunner';
export { useLiveContext } from './hooks/useLiveContext';
export { LiveContext } from './context/LiveContext';

// Engine, for advanced use — a custom scheduler, or compiling outside React.
export { compile } from './core/compile';
export type { CompileInput } from './core/compile';
export { transpile, preloadTranspiler, setTranspiler } from './core/transpile';
export { builtinModules } from './core/builtins';
export {
  defineModule,
  defineLoader,
  normalizeModule,
  createRequire,
  resolveModules,
} from './core/resolver';
export { createRegistry, registryFromGlob } from './core/registry';
export type { GlobResult } from './core/registry';
export { createRenderBudget } from './core/guards';
export type { RenderBudgetOptions } from './core/guards';

// Errors.
export {
  LiveError as LiveErrorBase,
  LiveCompileError,
  LiveRuntimeError,
  RenderLoopError,
  ModuleNotFoundError,
  NoComponentError,
  TranspilerLoadError,
} from './core/errors';

export type {
  CompileOptions,
  CompileResult,
  ExtractionSource,
  LiveContextValue,
  LiveRenderable,
  LiveRunnerState,
  LiveScope,
  ModuleLoader,
  ModuleRegistry,
  ModuleValue,
  NormalizedModule,
  TransformFn,
  TransformResult,
  TranspileOptions,
  UseLiveRunnerOptions,
} from './core/types';
