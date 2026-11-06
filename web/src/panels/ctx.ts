import type { Incident } from '@live911/shared';
import type { Selection, Store } from '../store';
import type { Api } from './api';
import type { Parents } from './nav';

/** Contesto condiviso dai pannelli (niente globali). */
export interface Ctx {
  store: Store;
  api: Api;
  /** nome del quartiere (da summary, API o chiamate viste) */
  areaName(id: string): string | undefined;
  /** nome dell'incrocio (da API o chiamate viste) */
  intersectionName(id: string): string | undefined;
  setAreaName(id: string, name: string): void;
  setIntersectionName(id: string, name: string): void;
  onNames(fn: () => void): () => void;
  /** ricorda una chiamata (da API) per risalire ai livelli superiori */
  remember(inc: Incident): void;
  lookupIncident(id: string): (Parents & { type?: Incident['type'] }) | undefined;
  /** preferenza locale: nasconde l'attività di polizia a bassa rilevanza da liste e classifiche */
  hideProactive(): boolean;
  setHideProactive(v: boolean): void;
  onPrefs(fn: () => void): () => void;
  navigate(sel: Selection): void;
}

export interface Part {
  destroy(): void;
}

export function createCtx(store: Store, api: Api): Ctx {
  const areaNames = new Map<string, string>();
  const ixNames = new Map<string, string>();
  const seen = new Map<string, Pick<Incident, 'areaId' | 'intersectionId' | 'type'>>();
  const nameListeners = new Set<() => void>();
  const prefListeners = new Set<() => void>();
  let hide = false;
  const fire = (set: Set<() => void>): void => {
    for (const fn of set) fn();
  };
  return {
    store,
    api,
    areaName: (id) => areaNames.get(id) ?? store.summary?.byArea.find((a) => a.id === id)?.name,
    intersectionName: (id) => ixNames.get(id),
    setAreaName(id, name) {
      if (areaNames.get(id) === name) return;
      areaNames.set(id, name);
      fire(nameListeners);
    },
    setIntersectionName(id, name) {
      if (ixNames.get(id) === name) return;
      ixNames.set(id, name);
      fire(nameListeners);
    },
    onNames(fn) {
      nameListeners.add(fn);
      return () => nameListeners.delete(fn);
    },
    remember(inc) {
      seen.set(inc.id, { areaId: inc.areaId, intersectionId: inc.intersectionId, type: inc.type });
      if (seen.size > 200) {
        const first = seen.keys().next().value;
        if (first !== undefined) seen.delete(first);
      }
      let changed = false;
      if (inc.areaName && areaNames.get(inc.areaId) !== inc.areaName) {
        areaNames.set(inc.areaId, inc.areaName);
        changed = true;
      }
      if (inc.address && ixNames.get(inc.intersectionId) !== inc.address) {
        ixNames.set(inc.intersectionId, inc.address);
        changed = true;
      }
      if (changed) fire(nameListeners);
    },
    lookupIncident: (id) => store.incidents.get(id) ?? seen.get(id),
    hideProactive: () => hide,
    setHideProactive(v) {
      if (hide === v) return;
      hide = v;
      fire(prefListeners);
    },
    onPrefs(fn) {
      prefListeners.add(fn);
      return () => prefListeners.delete(fn);
    },
    navigate(sel) {
      store.select(sel);
    },
  };
}
