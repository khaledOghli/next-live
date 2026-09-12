'use client';

import { createContext } from 'react';
import type { LiveContextValue } from '../core/types';

/**
 * Null rather than a default value, so `useLiveContext` can tell "outside a
 * provider" apart from "inside a provider that has not compiled yet".
 */
export const LiveContext = createContext<LiveContextValue | null>(null);

LiveContext.displayName = 'LiveContext';
