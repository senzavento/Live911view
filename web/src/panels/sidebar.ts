import type { IncidentType, StateSummary } from '@live911/shared';
import { TYPE_META } from '@live911/shared';
import type { Ctx, Part } from './ctx';
import { h, rafThrottle, setText, toggleClass } from './dom';
import { fmtDecimal, fmtInt } from './format';
import { createTypeBars } from './charts/bars';
import { createStackedArea } from './charts/stacked-area';
import type { Layout } from './layout';
import { normalizeSelection } from './nav';
import { createRanking, type RankItem } from './ranking';

export type RankMode = 'active' | 'per100k';

/** Valore di classifica di uno stato per modalità e filtro tipo (funzione pura). */
export function stateValue(s: StateSummary, mode: RankMode, type: IncidentType | null): number {
  if (mode === 'active') return type ? (s.byType[type] ?? 0) : s.active;
  if (!type) return s.per100k;
  return s.active > 0 ? s.per100k * ((s.byType[type] ?? 0) / s.active) : 0;
}

export function rankStates(
  states: readonly StateSummary[],
  mode: RankMode,
  type: IncidentType | null,
  query: string,
  current?: string,
): RankItem[] {
  const q = query.trim().toLowerCase();
  const rows = states
    .filter((s) => !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase() === q || s.code.toLowerCase().startsWith(q))
    .map((s) => ({ s, v: stateValue(s, mode, type) }))
    .sort((a, b) => b.v - a.v || a.s.name.localeCompare(b.s.name, 'it'));
  const max = Math.max(1e-9, ...rows.map((r) => r.v));
  return rows.map(({ s, v }) => ({
    key: s.code,
    name: s.name,
    tag: s.code,
    valueText: mode === 'active' ? fmtInt(v) : fmtDecimal(v),
    pct: Math.round((v / max) * 100),
    current: s.code === current,
    critical: s.critical,
  }));
}

export function createSidebar(root: HTMLElement, ctx: Ctx, layout: Layout): Part {
  const { store } = ctx;
  let typeFilter: IncidentType | null = null;
  let mode: RankMode = 'active';
  let query = '';

  const bars = createTypeBars((t) => {
    typeFilter = t;
    render();
  });
  const area = createStackedArea('Incidenti negli ultimi 60 minuti');
  const filterNote = h('p', { class: 'note' });

  const rank = createRanking((code) => ctx.navigate({ state: code }), 'Classifica degli stati');
  const empty = h('p', { class: 'empty', text: 'Nessuno stato trovato.' });
  const rankCount = h('span', { class: 'sec__meta' });

  const modeBtns = (['active', 'per100k'] as const).map((m) =>
    h('button', {
      class: 'seg__btn',
      text: m === 'active' ? 'Attivi' : 'Ogni 100k ab.',
      attrs: { type: 'button', 'aria-pressed': m === mode ? 'true' : 'false' },
      on: {
        click: () => {
          mode = m;
          render();
        },
      },
    }),
  );
  const search = h('input', {
    class: 'input',
    attrs: { type: 'search', placeholder: 'Cerca stato…', 'aria-label': 'Cerca stato', autocomplete: 'off', spellcheck: 'false' },
    on: {
      input: () => {
        query = search.value;
        render();
      },
    },
  });
  const skeleton = h('p', { class: 'empty', text: 'In attesa dei dati…' });

  const section = (title: string, ...body: Array<Node | null>): HTMLElement => {
    const id = `sec-${Math.random().toString(36).slice(2, 8)}`;
    const head = h('h2', { class: 'sec__title', text: title, id });
    return h('section', { class: 'sec', attrs: { 'aria-labelledby': id } }, head, ...body);
  };
  const rankSec = section(
    'Classifica stati',
    h('div', { class: 'seg', attrs: { role: 'group', 'aria-label': 'Criterio di classifica' } }, ...modeBtns),
    search,
    rank.el,
    empty,
  );
  rankSec.querySelector('.sec__title')?.after(rankCount);

  const wrap = h(
    'div',
    { class: 'side' },
    h(
      'div',
      { class: 'side__close' },
      h('span', { text: 'Aggregati nazionali' }),
      h('button', { class: 'btn', text: 'Chiudi', attrs: { type: 'button' }, on: { click: () => layout.toggleSidebar(false) } }),
    ),
    section('Per tipologia', bars.el, filterNote),
    section('Ultimi 60 minuti', area.el),
    rankSec,
    skeleton,
  );
  root.replaceChildren(wrap);

  function render(): void {
    const s = store.summary;
    toggleClass(wrap, 'is-loading', !s);
    skeleton.style.display = s ? 'none' : '';
    modeBtns.forEach((b, i) => b.setAttribute('aria-pressed', (i === 0 ? mode === 'active' : mode === 'per100k') ? 'true' : 'false'));
    if (!s) return;
    bars.update(s.byType, typeFilter);
    setText(filterNote, typeFilter ? `Filtro locale: ${TYPE_META[typeFilter].label} (tocca di nuovo per rimuovere)` : '');
    filterNote.style.display = typeFilter ? '' : 'none';
    area.update(s.timeline, typeFilter);
    const cur = normalizeSelection(store.selection, store.incidents).state;
    const items = rankStates(s.byState, mode, typeFilter, query, cur);
    rank.update(items);
    empty.style.display = items.length ? 'none' : '';
    setText(rankCount, `${items.length}/${s.byState.length}`);
  }

  const throttled = rafThrottle(render);
  const unsub = store.subscribe((e) => {
    if (e.kind === 'summary' || e.kind === 'snapshot' || e.kind === 'selection') throttled.run();
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
