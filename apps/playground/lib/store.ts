'use client';

import { useSyncExternalStore } from 'react';

/**
 * A minimal store standing in for Zustand/Redux.
 *
 * The point of registering it in `modules` is that snippets share *this*
 * instance: state written by a live snippet is visible to the host app and
 * vice versa. That only works because snippets are evaluated in the host
 * realm rather than an iframe.
 */
let items: string[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = (): string[] => items;

export function useCart(): string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function addItem(item: string): void {
  items = [...items, item];
  emit();
}

export function clearCart(): void {
  items = [];
  emit();
}
