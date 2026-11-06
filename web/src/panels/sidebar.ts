import { TYPE_META, type AreaSummary, type IncidentType } from '@live911/shared';
import type { Ctx, Part } from './ctx';
import { createTypeBars } from './charts/bars';
import { createStackedArea } from './charts/stacked-area';
import { h, rafThrottle, setText, toggleClass } from './dom';
import { fmtInt } from './format';
import type { Layout } from './layout';
import { normalizeSelection } from './nav';
import { createDataNote } from './notes';
import { createRanking, type RankItem } from './ranking';
import { activeCount, visibleTypes } from './scope';

export type RankMode = 'active' | 'last24h';

/** Valore di classifica di un quartiere (funzione pura). */
export function areaValue(a: AreaSummary, mode: RankMode, type: IncidentType | null, hideProactive: boolean): number {
  if (mode === 'last24h') return a.last24h;
  return type ? (a.byType[type] ?? 0) : activeCount(a, hideProactive);
}

export function rankAreas(
  areas: readonly AreaSummary[],
  mode: RankMode,
  type: IncidentType | null,
  query: string,
  current?: string,
  hideProactive = false,
): RankItem[] {
  const q = query.trim().toLowerCase();
  const rows = areas
    .filter((a) => !q || a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q))
    .map((a) => ({ a, v: areaValue(a, mode, type, hideProactive) }))
    .sort((x, y) => y.v - x.v || x.a.name.localeCompare(y.a.name, 'it'));
  const max = Math.max(1, ...rows.map((r) => r.v));
  return rows.map(({ a, v }) => ({
    key: a.id,
    name: a.name,
    tag: mode === 'active' ? (a.critical ? `${fmtInt(a.critical)} critiche` : '') : `${fmtInt(a.active)} attive`,
    valueText: fmtInt(v),
    pct: Math.round((v / max) * 100),
    current: a.id === current,
    critical: a.critical,
  }));
}

export function createSidebar(root: HTMLElement, ctx: Ctx, layout: Layout): Part {
  const { store } = ctx;
  const prevLabel = root.getAttribute('aria-label');
  root.setAttribute('aria-label', 'Aggregati e classifica dei quartieri di San Francisco');
  let typeFilter: IncidentType | null = null;
  let mode: RankMode = 'active';
  let query = '';

  const bars = createTypeBars((t) => {
    typeFilter = t;
    render();
  });
  const area = createStackedArea('Chiamate per ora, ultime 24 ore');
  const filterNote = h('p', { class: 'note' });
  const modeNote = h('p', { class: 'note' });

  const rank = createRanking((id) => ctx.navigate({ areaId: id }), 'Classifica dei quartieri');
  const empty = h('p', { class: 'empty', text: 'Nessun quartiere trovato.' });
  const rankCount = h('span', { class: 'sec__meta' });

  const MODES: Array<[RankMode, string]> = [
    ['active', 'Attive'],
    ['last24h', 'Ultime 24 h'],
  ];
  const modeBtns = MODES.map(([m, label]) =>
    h('button', {
      class: 'seg__btn',
      text: label,
      attrs: { type: 'button', 'aria-pressed': m === mode ? 'true' : 'false' },
      on: {
        click: () => {
          mode = m;
          render();
        },
      },
    }),
  );
  const searchId = `q-${Math.random().toString(36).slice(2, 8)}`;
  const search = h('input', {
    class: 'input',
    id: searchId,
    attrs: { type: 'search', placeholder: 'Cerca quartiere…', 'aria-label': 'Cerca quartiere', autocomplete: 'off', spellcheck: 'false' },
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
    'Quartieri',
    h('div', { class: 'seg', attrs: { role: 'group', 'aria-label': 'Criterio di classifica' } }, ...modeBtns),
    search,
    modeNote,
    rank.el,
    empty,
  );
  rankSec.querySelector('.sec__title')?.after(rankCount);
  const note = createDataNote('side__note');
  const noteSec = section('Informazioni sui dati', note.el);
  noteSec.classList.add('sec--note');

  const wrap = h(
    'div',
    { class: 'side' },
    h(
      'div',
      { class: 'side__close' },
      h('span', { text: 'Aggregati di San Francisco' }),
      h('button', { class: 'btn', text: 'Chiudi', attrs: { type: 'button' }, on: { click: () => layout.toggleSidebar(false) } }),
    ),
    section('Attive per categoria', bars.el, filterNote),
    section('Ultime 24 ore', area.el),
    rankSec,
    noteSec,
    skeleton,
  );
  root.replaceChildren(wrap);

  function render(): void {
    const s = store.summary;
    toggleClass(wrap, 'is-loading', !s);
    skeleton.hidden = !!s;
    modeBtns.forEach((b, i) => b.setAttribute('aria-pressed', MODES[i]?.[0] === mode ? 'true' : 'false'));
    if (!s) return;
    const hide = ctx.hideProactive();
    const types = visibleTypes(hide);
    if (typeFilter === 'proactive' && hide) typeFilter = null;
    bars.update(s.byType, typeFilter, hide ? ['proactive'] : []);
    setText(filterNote, typeFilter ? `Filtro locale: ${TYPE_META[typeFilter].label} (tocca di nuovo per rimuovere)` : '');
    filterNote.hidden = !typeFilter;
    area.update(s.timeline, typeFilter ? [typeFilter] : types);
    const cur = normalizeSelection(store.selection, ctx.lookupIncident).areaId;
    const items = rankAreas(s.byArea, mode, mode === 'active' ? typeFilter : null, query, cur, hide);
    rank.update(items);
    empty.hidden = items.length > 0;
    setText(rankCount, `${items.length}/${s.byArea.length}`);
    const notes: string[] = [];
    if (mode === 'last24h' && typeFilter) notes.push('Il filtro categoria non è disponibile per le ultime 24 h.');
    if (mode === 'last24h' && hide) notes.push('Le ultime 24 h comprendono anche l’attività di polizia.');
    setText(modeNote, notes.join(' '));
    modeNote.hidden = notes.length === 0;
    note.update(s);
  }

  const throttled = rafThrottle(render);
  const unsub = store.subscribe((e) => {
    if (e.kind === 'summary' || e.kind === 'snapshot' || e.kind === 'selection') throttled.run();
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
