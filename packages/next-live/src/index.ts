'use client';

// Every component and hook this barrel re-exports is client-only, and
// `src/editor.ts` already says so. The built entry is stamped by
// scripts/add-use-client.mjs regardless, but keeping the directive in source
// means the package is also correct if a consumer ever compiles it directly
// (a workspace setup with `transpilePackages`, say) rather than using `dist`.
// Components. Exported as named bindings, never as static properties on a
// parent (`Live.Preview`): across the RSC boundary a Server Component receives
// a client *reference*, so any attached property resolves to undefined.
export { LiveProvider, preloadSandboxHost } from './components/LiveProvider';
export type { LiveProviderProps } from './components/LiveProvider';
// <LiveEditor> lives in `next-live/editor` - it is the only thing that pulls
// in a syntax highlighter, and preview-only pages should not pay for it.
export { LivePreview } from './components/LivePreview';
export type { LivePreviewProps } from './components/LivePreview';
export { LiveError } from './components/LiveError';
export type { LiveErrorProps } from './components/LiveError';
export { LiveErrorBoundary } from './components/LiveErrorBoundary';
export type { LiveErrorBoundaryProps } from './components/LiveErrorBoundary';
export { LiveFileTabs } from './components/LiveFileTabs';
export type { LiveFileTabsProps } from './components/LiveFileTabs';

// Hooks and context, for hosts building their own UI.
export { useLiveRunner } from './hooks/useLiveRunner';
export { useLiveModule } from './hooks/useLiveModule';
export type { LiveModuleState, UseLiveModuleOptions } from './hooks/useLiveModule';
export { useLiveContext } from './hooks/useLiveContext';
export { LiveContext } from './context/LiveContext';
// The console panel itself lives in `next-live/console`; the context it reads
// is exported here for hosts wiring their own.
export { LiveConsoleContext } from './context/LiveConsoleContext';
export type { LiveConsoleContextValue } from './context/LiveConsoleContext';

// Engine, for advanced use - a custom scheduler, or compiling outside React.
export { compile, compileModule } from './core/compile';
export type { CompileFilesInput, CompileInput, CompileModuleResult } from './core/compile';
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
export type { ResolvedModules, ResolveOptions } from './core/resolver';
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
  LiveSandboxError,
} from './core/errors';
export type { LiveErrorCode, LiveSandboxErrorReason } from './core/errors';
// Errors that crossed a realm boundary (the sandbox iframe) travel as data.
export { rehydrateError, serializeError } from './core/serialize-error';
export type { SerializedError } from './core/serialize-error';

export { errorPosition } from './core/positions';
export type { PositionedError } from './core/positions';

export type {
  CompileOptions,
  CompileResult,
  CompileSuccessInfo,
  ConsoleEntry,
  ConsoleLevel,
  ConsoleMethod,
  ExtractionSource,
  FormatErrorFn,
  FormatErrorPosition,
  LiveContextValue,
  LiveProjectState,
  LiveRenderable,
  LiveRunnerState,
  LiveSandboxConfig,
  LiveScope,
  SandboxFrameProps,
  SandboxHandle,
  SandboxPermission,
  SandboxStatus,
  ModuleLoader,
  ModuleRegistry,
  ModuleValue,
  NormalizedModule,
  TransformFn,
  TransformResult,
  TranspileOptions,
  UseLiveRunnerOptions,
} from './core/types';
