'use client';

/**
 * The runtime for the page inside the sandbox iframe.
 *
 * Import this only on the sandbox page, the one `<LiveProvider sandbox={{ src }}>`
 * points at. It carries its own copy of the compiler and mounts its own React
 * root, and a host page running in sandbox mode needs neither.
 */
export { mountSandbox } from './sandbox/runtime/mount';
export type { MountSandboxOptions, SandboxMount } from './sandbox/runtime/mount';
export { LiveSandboxRoot } from './sandbox/runtime/LiveSandboxRoot';
export type { LiveSandboxRootProps } from './sandbox/runtime/LiveSandboxRoot';
export type { SandboxRuntimeOptions } from './sandbox/runtime/core';
export { PROTOCOL_VERSION } from './sandbox/protocol/messages';
