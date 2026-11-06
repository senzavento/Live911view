import { INCIDENT_TYPES, TYPE_META, type IncidentType } from '@live911/shared';
import type { Ctx, Part } from './ctx';
import { KeyedList, h, rafThrottle, setAttr, setText, toggleClass } from './dom';
import { fmtInt } from './format';
import { levelOf, normalizeSelection } from './nav';
import { scopeCounts, typeLabelLong } from './scope';

interface LegendItem {
  type: IncidentType;
  city: number;
  scope: number | null;
  dim: boolean;
}

/** Legenda categorie (overlay sulla mappa): conteggio attive a San Francisco e nell'ambito corrente. */
export function createLegend(root: HTMLElement, ctx: Ctx): Part {
  const { store } = ctx;
  const prevLabel = root.getAttribute('aria-label');
  root.setAttribute('aria-label', 'Legenda categorie');
  const ul = h('ul', { class: 'legend__list' });
  const scopeHead = h('span', { class: 'legend__col' });
  const list = new KeyedList<LegendItem>(
    ul,
    (i) => i.type,
    (first) => {
      const meta = TYPE_META[first.type];
      const city = h('span', { class: 'legend__n' });
      const scope = h('span', { class: 'legend__n legend__n--scope' });
      const li = h(
        'li',
        { class: 'legend__item', vars: { '--c': meta.color } },
        h('span', { class: 'dot', attrs: { 'aria-hidden': 'true' } }),
        h('span', { class: 'legend__label', text: typeLabelLong(first.type) }),
        city,
        scope,
      );
      return {
        el: li,
        update(item) {
          setText(city, fmtInt(item.city));
          setText(scope, item.scope === null ? '' : fmtInt(item.scope));
          toggleClass(li, 'is-dim', item.dim);
        },
      };
    },
  );
  const toggle = h('button', {
    class: 'legend__toggle',
    attrs: { type: 'button', 'aria-pressed': 'false' },
    on: { click: () => ctx.setHideProactive(!ctx.hideProactive()) },
  });
  const details = h(
    'details',
    { class: 'legend', attrs: { open: true } },
    h('summary', { class: 'legend__sum', text: 'Legenda · chiamate attive' }),
    h('div', { class: 'legend__head', attrs: { 'aria-hidden': 'true' } }, h('span'), h('span', { class: 'legend__col', text: 'SF' }), scopeHead),
    ul,
    toggle,
  );
  if (typeof matchMedia === 'function' && matchMedia('(max-width: 899px)').matches) details.open = false;
  root.replaceChildren(details);

  function render(): void {
    const sel = normalizeSelection(store.selection, ctx.lookupIncident);
    const level = levelOf(sel);
    const cityCounts = store.summary?.byType;
    const scoped = level > 0 ? scopeCounts(store.incidents.values(), sel) : null;
    const hide = ctx.hideProactive();
    setText(scopeHead, level === 0 ? '' : level === 1 ? 'Quartiere' : 'Incrocio');
    details.classList.toggle('has-scope', level > 0);
    setText(toggle, hide ? 'Mostra attività di polizia nelle liste' : 'Nascondi attività di polizia dalle liste');
    setAttr(toggle, 'aria-pressed', hide ? 'true' : 'false');
    setAttr(toggle, 'title', 'Vale per liste, classifiche e grafici dei pannelli; i totali (KPI) restano completi.');
    list.update(
      INCIDENT_TYPES.map((type) => ({
        type,
        city: cityCounts?.[type] ?? 0,
        scope: scoped ? scoped[type] : null,
        dim: hide && type === 'proactive',
      })),
    );
  }

  const throttled = rafThrottle(render);
  const unsub = store.subscribe((e) => {
    if (e.kind === 'incident' || e.kind === 'summary' || e.kind === 'snapshot' || e.kind === 'selection') throttled.run();
  });
  const unPrefs = ctx.onPrefs(throttled.run);
  render();
  return {
    destroy() {
      unsub();
      unPrefs();
      throttled.cancel();
      if (prevLabel === null) root.removeAttribute('aria-label');
      else root.setAttribute('aria-label', prevLabel);
      root.replaceChildren();
    },
  };
}
