'use client';

import { create } from 'zustand';

interface CartStore {
  items: string[];
  addItem: (item: string) => void;
  removeItem: (index: number) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartStore>((set) => ({
  items: [],
  addItem: (item) => set((s) => ({ items: [...s.items, item] })),
  removeItem: (index) => set((s) => ({ items: s.items.filter((_, i) => i !== index) })),
  clearCart: () => set({ items: [] }),
}));

export const useCart = () => useCartStore((s) => s.items);

export const addItem = (item: string) => useCartStore.getState().addItem(item);

export const clearCart = () => useCartStore.getState().clearCart();

export const removeLastItem = () => {
  const { items, removeItem } = useCartStore.getState();
  if (items.length > 0) removeItem(items.length - 1);
};

export const getCartCount = () => useCartStore.getState().items.length;
