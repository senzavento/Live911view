import { INCIDENT_TYPES, TYPE_META, type IncidentType } from '@live911/shared';
import type { Ctx, Part } from './ctx';
import { KeyedList, h, rafThrottle, setText } from './dom';
import { fmtInt } from './format';
import { levelOf, normalizeSelection } from './nav';

interface LegendItem {
  type: IncidentType;
  national: number;
  scope: number | null;
}

/** Legenda tipologie (overlay sulla mappa): conteggio nazionale e dell'ambito corrente. */
export function createLegend(root: HTMLElement, ctx: Ctx): Part {
  const { store } = ctx;
  const ul = h('ul', { class: 'legend__list' });
  const scopeHead = h('span', { class: 'legend__col', text: 'Ambito' });
  const list = new KeyedList<LegendItem>(
    ul,
    (i) => i.type,
    (first) => {
      const meta = TYPE_META[first.type];
      const nat = h('span', { class: 'legend__n' });
      const scope = h('span', { class: 'legend__n legend__n--scope' });
      const li = h(
        'li',
        { class: 'legend__item', vars: { '--c': meta.color } },
        h('span', { class: 'dot', attrs: { 'aria-hidden': 'true' } }),
        h('span', { class: 'legend__label', text: meta.label }),
        nat,
        scope,
      );
      return {
        el: li,
        update(item) {
          setText(nat, fmtInt(item.national));
          setText(scope, item.scope === null ? '' : fmtInt(item.scope));
        },
      };
    },
  );
  const natHead = h('span', { class: 'legend__col', text: 'USA' });
  const details = h(
    'details',
    { class: 'legend', attrs: { open: true } },
    h('summary', { class: 'legend__sum', text: 'Legenda' }),
    h('div', { class: 'legend__head', attrs: { 'aria-hidden': 'true' } }, h('span'), natHead, scopeHead),
    ul,
  );
  root.replaceChildren(details);

  function render(): void {
    const sel = normalizeSelection(store.selection, store.incidents);
    const level = levelOf(sel);
    const national = store.summary?.byType;
    let scopeCounts: Record<IncidentType, number> | null = null;
    if (level > 0) {
      scopeCounts = { fire: 0, medical: 0, police: 0, traffic: 0, hazmat: 0, rescue: 0 };
      for (const inc of store.incidents.values()) {
        if (inc.state !== sel.state) continue;
        if (sel.cityId && inc.cityId !== sel.cityId) continue;
        scopeCounts[inc.type]++;
      }
    }
    setText(scopeHead, level === 0 ? '' : level === 1 ? (sel.state ?? '') : 'Città');
    details.classList.toggle('has-scope', level > 0);
    list.update(
      INCIDENT_TYPES.map((type) => ({ type, national: national?.[type] ?? 0, scope: scopeCounts ? scopeCounts[type] : null })),
    );
  }

  const throttled = rafThrottle(render);
  const unsub = store.subscribe((e) => {
    if (e.kind === 'incident' || e.kind === 'summary' || e.kind === 'snapshot' || e.kind === 'selection') throttled.run();
  });
  render();
  return {
    destroy() {
      unsub();
      throttled.cancel();
      root.replaceChildren();
    },
  };
}
