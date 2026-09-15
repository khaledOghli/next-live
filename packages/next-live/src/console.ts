'use client';

/**
 * Console capture UI, on its own entry point.
 *
 * Capture itself lives in the engine and costs nothing until asked for. The
 * panel, the store, and the value inspector live here, so pages that never
 * show console output never download them.
 */
export { LiveConsole } from './console/LiveConsole';
export type { LiveConsoleProps, LiveConsoleEntryInfo } from './console/LiveConsole';
export { useLiveConsole } from './console/useLiveConsole';
export type { LiveConsoleState, UseLiveConsoleOptions } from './console/useLiveConsole';
export { createConsoleStore } from './console/createConsoleStore';
export type { ConsoleStore, ConsoleStoreOptions } from './console/createConsoleStore';
export { formatConsoleArgs, formatConsoleValue } from './core/format-value';
export { serializeValue, serializeValues } from './core/serialize-value';
export type { SerializedValue, SerializeOptions } from './core/serialize-value';
export type { ConsoleEntry, ConsoleLevel, ConsoleMethod } from './core/types';
