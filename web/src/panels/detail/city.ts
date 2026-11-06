import { TYPE_META, PRIORITY_LABEL, type CitySummary, type Incident } from '@live911/shared';
import { Resource } from '../api';
import { createTypeBars } from '../charts/bars';
import { createStackedArea } from '../charts/stacked-area';
import type { Ctx } from '../ctx';
import { KeyedList, h, rafThrottle, setAttr, setText, toggleClass } from '../dom';
import { STATUS_LABEL, fmtDuration, fmtElapsed, fmtInt, priorityShort } from '../format';
import { createKpiGrid, createShell, section, type View } from './common';

/** Ordina per priorità (1 prima), poi per creazione più recente. */
export function sortIncidents(list: readonly Incident[]): Incident[] {
  return list.slice().sort((a, b) => a.priority - b.priority || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/**
 * Incidenti attivi della città: se lo store ha già ricevuto lo snapshot è l'unica fonte
 * (live, rimuove i risolti), altrimenti si usa la lista caricata via REST.
 */
export function pickCityIncidents(
  storeIncidents: ReadonlyMap<string, Incident>,
  cityId: string,
  fetched: readonly Incident[],
  storeReady: boolean,
): Incident[] {
  const source = storeReady ? [...storeIncidents.values()] : fetched;
  return sortIncidents(source.filter((i) => i.cityId === cityId && i.status !== 'resolved'));
}

const MAX_ROWS = 150;

export function createCityView(ctx: Ctx, cityId: string, selectedIncident?: string): View {
  const { store } = ctx;
  const title = h('h2', { class: 'detail__title', text: ctx.cityNames.get(cityId) ?? cityId });
  const grid = createKpiGrid(
    {
      active: { label: 'Attivi', format: fmtInt },
      critical: { label: 'Critici', format: fmtInt, tone: 'danger' },
      last24h: { label: 'Ultime 24 h', format: fmtInt },
      resp: { label: 'Risposta media', format: fmtDuration, animate: false },
    },
    'Indicatori città',
  );
  const bars = createTypeBars();
  const area = createStackedArea('Incidenti città ultimi 60 minuti');
  const more = h('p', { class: 'note' });
  const empty = h('p', { class: 'empty', text: 'Nessun incidente attivo in questa città.' });
  const ul = h('ul', { class: 'inc-list', attrs: { 'aria-label': 'Incidenti attivi, ordinati per priorità' } });

  const rows = new KeyedList<Incident>(
    ul,
    (i) => i.id,
    (first) => {
      const prio = h('span', { class: 'chip' });
      const type = h('span', { class: 'inc__type' });
      const addr = h('span', { class: 'inc__addr' });
      const status = h('span', { class: 'inc__status' });
      const elapsed = h('span', { class: 'inc__elapsed' });
      const btn = h(
        'button',
        { class: 'inc__btn', attrs: { type: 'button' }, on: { click: () => ctx.navigate({ state: first.state, cityId: first.cityId, incidentId: first.id }) } },
        h('span', { class: 'inc__top' }, prio, type, elapsed),
        addr,
        status,
      );
      const li = h('li', { class: 'inc', vars: { '--c': TYPE_META[first.type].color } }, btn);
      return {
        el: li,
        update(i) {
          setText(prio, priorityShort(i.priority));
          setAttr(prio, 'class', `chip chip--p${i.priority}`);
          setAttr(prio, 'title', `Priorità ${PRIORITY_LABEL[i.priority].toLowerCase()}`);
          setText(type, TYPE_META[i.type].label);
          setText(addr, i.address);
          setText(status, `${STATUS_LABEL[i.status]} · ${fmtInt(i.unitsAssigned)} unità`);
          elapsed.dataset['created'] = i.createdAt;
          setText(elapsed, fmtElapsed(Date.now() - Date.parse(i.createdAt)));
          toggleClass(li, 'is-current', i.id === selectedIncident);
          setAttr(btn, 'aria-current', i.id === selectedIncident ? 'true' : null);
          setAttr(btn, 'aria-label', `${TYPE_META[i.type].label}, priorità ${PRIORITY_LABEL[i.priority].toLowerCase()}, ${i.address}, ${STATUS_LABEL[i.status]}`);
        },
      };
    },
  );

  const shell = createShell(() => res.retry(), 'Città');
  const listSec = section('Incidenti attivi', ul, more, empty);
  shell.content.append(grid.el, section('Per tipologia', bars.el), section('Ultimi 60 minuti', area.el), listSec);

  let summary: CitySummary | null = null;
  let fetched: Incident[] = [];
  const res = new Resource<CitySummary>(
    (signal) => ctx.api.city(cityId, signal),
    (s) => {
      shell.setStatus(s);
      if (s.status === 'ready') {
        summary = s.data;
        ctx.setCityName(cityId, s.data.city.name);
        setText(title, s.data.city.name);
        renderSummary();
      }
    },
    10_000,
  );
  const incAbort = new AbortController();
  void ctx.api
    .cityIncidents(cityId, incAbort.signal)
    .then((l) => {
      fetched = l;
      renderList();
    })
    .catch(() => {
      /* lista live dallo store; l'errore del summary è già mostrato */
    });

  function renderSummary(): void {
    if (!summary) return;
    grid.kpis['active']?.set(summary.active);
    grid.kpis['critical']?.set(summary.critical);
    grid.kpis['last24h']?.set(summary.last24h);
    grid.kpis['resp']?.set(summary.avgResponseSec);
    bars.update(summary.byType);
    area.update(summary.timeline);
  }

  function renderList(): void {
    const list = pickCityIncidents(store.incidents, cityId, fetched, store.summary !== null);
    rows.update(list.slice(0, MAX_ROWS));
    empty.hidden = list.length > 0;
    more.hidden = list.length <= MAX_ROWS;
    setText(more, `Mostrati i primi ${MAX_ROWS} di ${fmtInt(list.length)}.`);
  }

  const throttled = rafThrottle(renderList);
  const unsub = store.subscribe((e) => {
    if (e.kind === 'incident' && e.incident.cityId === cityId) throttled.run();
    else if (e.kind === 'snapshot') throttled.run();
  });
  const unNames = ctx.onNames(() => {
    const n = ctx.cityNames.get(cityId);
    if (n) setText(title, n);
  });
  const tick = setInterval(() => {
    for (const el of ul.querySelectorAll<HTMLElement>('[data-created]')) {
      setText(el, fmtElapsed(Date.now() - Date.parse(el.dataset['created'] ?? '')));
    }
  }, 1000);

  shell.setStatus({ status: 'loading' });
  res.start();
  renderList();

  return {
    el: h('div', { class: 'view' }, title, shell.el),
    destroy() {
      unsub();
      unNames();
      throttled.cancel();
      clearInterval(tick);
      incAbort.abort();
      res.destroy();
      grid.destroy();
    },
  };
}
