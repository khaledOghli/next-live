'use client';

import { useContext } from 'react';
import { LiveContext } from '../context/LiveContext';
import type { LiveContextValue } from '../core/types';

/**
 * Reads the surrounding `<LiveProvider>`. Use it to build custom editors,
 * toolbars, or status indicators that stay in sync with the preview.
 */
export function useLiveContext(): LiveContextValue {
  const value = useContext(LiveContext);
  if (value === null) {
    throw new Error(
      'useLiveContext must be called inside a <LiveProvider>. If you want to run ' +
        'code without the provider, use the useLiveRunner hook directly.',
    );
  }
  return value;
}
