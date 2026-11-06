import type { Selection, Store } from '../store';
import type { Api } from './api';

/** Contesto condiviso dai pannelli (niente globali). */
export interface Ctx {
  store: Store;
  api: Api;
  /** nomi città noti (id → nome), per breadcrumb e liste */
  cityNames: Map<string, string>;
  setCityName(id: string, name: string): void;
  onNames(fn: () => void): () => void;
  navigate(sel: Selection): void;
}

export interface Part {
  destroy(): void;
}

export function createCtx(store: Store, api: Api): Ctx {
  const cityNames = new Map<string, string>();
  const listeners = new Set<() => void>();
  return {
    store,
    api,
    cityNames,
    setCityName(id, name) {
      if (cityNames.get(id) === name) return;
      cityNames.set(id, name);
      for (const fn of listeners) fn();
    },
    onNames(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    navigate(sel) {
      store.select(sel);
    },
  };
}
