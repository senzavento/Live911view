import type { Store } from '../store';
import { createApi, type Api } from './api';
import { createCtx } from './ctx';
import { createDetail } from './detail';
import { createHeader } from './header';
import { createLayout } from './layout';
import { createLegend } from './legend';
import { createSidebar } from './sidebar';

export interface PanelRoots {
  header: HTMLElement;
  sidebar: HTMLElement;
  detail: HTMLElement;
  legend: HTMLElement;
}

export interface MountOptions {
  /** per test/dev: client API alternativo */
  api?: Api;
}

/** Monta header, sidebar, detail e legenda. Restituisce la funzione di cleanup. */
export function mountPanels(roots: PanelRoots, store: Store, opts: MountOptions = {}): () => void {
  const ctx = createCtx(store, opts.api ?? createApi());
  const layout = createLayout(roots.header);
  const parts = [
    createHeader(roots.header, ctx, layout),
    createSidebar(roots.sidebar, ctx),
    createDetail(roots.detail, ctx, layout),
    createLegend(roots.legend, ctx),
  ];
  return () => {
    for (const p of parts.reverse()) p.destroy();
    layout.destroy();
  };
}
