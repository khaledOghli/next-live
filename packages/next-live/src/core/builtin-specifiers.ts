/**
 * The specifiers `next-live` registers for every snippet.
 *
 * Kept apart from `builtins.ts` because that module imports React, and the
 * validator must be usable in a CI script or a Route Handler where pulling in
 * React would be pointless. Names only, no values.
 */
export const BUILTIN_SPECIFIERS = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
] as const;
