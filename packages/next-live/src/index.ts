// Components. Exported as named bindings, never as static properties on a
// parent (`Live.Preview`): across the RSC boundary a Server Component receives
// a client *reference*, so any attached property resolves to undefined.
export { LiveProvider } from './components/LiveProvider';
export type { LiveProviderProps } from './components/LiveProvider';
// <LiveEditor> lives in `next-live/editor` — it is the only thing that pulls
// in a syntax highlighter, and preview-only pages should not pay for it.
export { LivePreview } from './components/LivePreview';
export type { LivePreviewProps } from './components/LivePreview';
export { LiveError } from './components/LiveError';
export type { LiveErrorProps } from './components/LiveError';
export { LiveErrorBoundary } from './components/LiveErrorBoundary';
export type { LiveErrorBoundaryProps } from './components/LiveErrorBoundary';

// Hooks and context, for hosts building their own UI.
export { useLiveRunner } from './hooks/useLiveRunner';
export { useLiveModule } from './hooks/useLiveModule';
export type { LiveModuleState, UseLiveModuleOptions } from './hooks/useLiveModule';
export { useLiveContext } from './hooks/useLiveContext';
export { LiveContext } from './context/LiveContext';

// Engine, for advanced use — a custom scheduler, or compiling outside React.
export { compile, compileModule } from './core/compile';
export type { CompileInput, CompileModuleResult } from './core/compile';
export {
  transpile,
  preloadTranspiler,
  setTranspiler,
  precompiledTransform,
} from './core/transpile';
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

export { errorPosition } from './core/positions';
export type { PositionedError } from './core/positions';

export type {
  CompileOptions,
  CompileResult,
  CompileSuccessInfo,
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
