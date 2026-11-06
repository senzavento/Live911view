import type { Ctx, Part } from '../ctx';
import { h, setText } from '../dom';
import type { Layout } from '../layout';
import { backLabel, levelOf, normalizeSelection, parentSelection, selectionKey, type Level } from '../nav';
import { createAreaView } from './area';
import type { View } from './common';
import { createIncidentView } from './incident';
import { createIntersectionView } from './intersection';

/** Pannello laterale/bottom sheet che mostra i livelli 1-3 in base a store.selection. */
export function createDetail(root: HTMLElement, ctx: Ctx, layout: Layout): Part {
  const { store } = ctx;
  const prevLabel = root.getAttribute('aria-label');
  root.setAttribute('aria-label', 'Dettaglio della selezione');
  const norm = () => normalizeSelection(store.selection, ctx.lookupIncident);
  const back = h('button', {
    class: 'btn btn--ghost',
    attrs: { type: 'button' },
    on: { click: () => ctx.navigate(parentSelection(norm())) },
  });
  const close = h('button', {
    class: 'btn btn--icon',
    text: '×',
    attrs: { type: 'button', 'aria-label': 'Chiudi dettaglio e torna a San Francisco' },
    on: { click: () => ctx.navigate({}) },
  });
  const bar = h('div', { class: 'detail__bar' }, back, close);
  const body = h('div', { class: 'detail__body' });
  const wrap = h('div', { class: 'detail' }, bar, body);
  root.replaceChildren(wrap);
  root.hidden = true;

  let view: View | null = null;
  let viewKey = '';
  let level: Level = 0;

  function sync(): void {
    const sel = norm();
    const key = selectionKey(sel);
    const next = levelOf(sel);
    level = next;
    setText(back, backLabel(next, !!sel.areaId));
    if (key === viewKey) return;
    viewKey = key;
    view?.destroy();
    view = null;
    body.replaceChildren();
    root.hidden = next === 0;
    layout.setDetailOpen(next > 0);
    if (next === 0) return;
    if (next === 1 && sel.areaId) view = createAreaView(ctx, sel.areaId);
    else if (next === 2 && sel.intersectionId) view = createIntersectionView(ctx, sel.intersectionId, sel.areaId);
    else if (next === 3 && sel.incidentId) view = createIncidentView(ctx, sel.incidentId);
    if (view) body.append(view.el);
    root.scrollTop = 0;
    body.scrollTop = 0;
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && level > 0 && root.contains(document.activeElement)) {
      e.preventDefault();
      ctx.navigate(parentSelection(norm()));
    }
  };
  root.addEventListener('keydown', onKey);
  const unsub = store.subscribe((e) => {
    if (e.kind === 'selection') sync();
  });
  // il livello 3 può risolvere i livelli superiori solo dopo il caricamento API
  const unNames = ctx.onNames(sync);
  sync();

  return {
    destroy() {
      unsub();
      unNames();
      root.removeEventListener('keydown', onKey);
      view?.destroy();
      view = null;
      layout.setDetailOpen(false);
      root.hidden = false;
      if (prevLabel === null) root.removeAttribute('aria-label');
      else root.setAttribute('aria-label', prevLabel);
      root.replaceChildren();
    },
  };
}
