import type { Ctx, Part } from '../ctx';
import { h, setText } from '../dom';
import type { Layout } from '../layout';
import { levelOf, normalizeSelection, parentSelection, selectionKey, type Level } from '../nav';
import { createCityView } from './city';
import type { View } from './common';
import { createIncidentView } from './incident';
import { createStateView } from './state';

/** Pannello laterale/bottom sheet che mostra il livello 1-3 in base a store.selection. */
export function createDetail(root: HTMLElement, ctx: Ctx, layout: Layout): Part {
  const { store } = ctx;
  const back = h('button', {
    class: 'btn btn--ghost',
    attrs: { type: 'button' },
    on: { click: () => ctx.navigate(parentSelection(normalizeSelection(store.selection, store.incidents))) },
  });
  const close = h('button', {
    class: 'btn btn--icon',
    text: '×',
    attrs: { type: 'button', 'aria-label': 'Chiudi dettaglio e torna alla vista nazionale' },
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

  function backLabel(l: Level): string {
    return l === 3 ? '← Città' : l === 2 ? '← Stato' : '← USA';
  }

  function sync(): void {
    const sel = normalizeSelection(store.selection, store.incidents);
    const key = selectionKey(sel);
    const next = levelOf(sel);
    level = next;
    if (key === viewKey) return;
    viewKey = key;
    view?.destroy();
    view = null;
    body.replaceChildren();
    root.hidden = next === 0;
    layout.setDetailOpen(next > 0);
    if (next === 0) return;
    setText(back, backLabel(next));
    if (next === 1 && sel.state) view = createStateView(ctx, sel.state);
    else if (next === 2 && sel.cityId) view = createCityView(ctx, sel.cityId);
    else if (next === 3 && sel.incidentId) view = createIncidentView(ctx, sel.incidentId);
    if (view) body.append(view.el);
    root.scrollTop = 0;
    body.scrollTop = 0;
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && level > 0 && root.contains(document.activeElement)) {
      e.preventDefault();
      ctx.navigate(parentSelection(normalizeSelection(store.selection, store.incidents)));
    }
  };
  root.addEventListener('keydown', onKey);
  const unsub = store.subscribe((e) => {
    if (e.kind === 'selection') sync();
  });
  sync();

  return {
    destroy() {
      unsub();
      root.removeEventListener('keydown', onKey);
      view?.destroy();
      view = null;
      layout.setDetailOpen(false);
      root.hidden = false;
      root.replaceChildren();
    },
  };
}
