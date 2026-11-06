import type { Store } from '../store';

export interface PanelRoots {
  header: HTMLElement;
  sidebar: HTMLElement;
  detail: HTMLElement;
  legend: HTMLElement;
}

/** STUB: da implementare (Agente 3). */
export function mountPanels(_roots: PanelRoots, _store: Store): () => void {
  return () => {};
}
