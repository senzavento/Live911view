import { TYPE_META } from '@live911/shared';
import type { ConnectionStatus, StoreEvent } from '../store';
import type { Ctx, Part } from './ctx';
import { KeyedList, h, rafThrottle, setAttr, setText, toggleClass } from './dom';
import { fmtDecimal, fmtDuration, fmtInt, shortId } from './format';
import { createKpi } from './kpi';
import { buildCrumbs, normalizeSelection, type Crumb } from './nav';
import type { Layout } from './layout';

const CONN_LABEL: Record<ConnectionStatus, string> = {
  live: 'In diretta',
  connecting: 'Connessione…',
  reconnecting: 'Riconnessione…',
};

export function createHeader(root: HTMLElement, ctx: Ctx, layout: Layout): Part {
  const { store } = ctx;

  const kpis = {
    active: createKpi({ label: 'Attivi', format: fmtInt, hint: 'in corso' }),
    last24h: createKpi({ label: 'Ultime 24 h', format: fmtInt, hint: 'incidenti' }),
    rate: createKpi({ label: 'Nuovi / min', format: fmtDecimal, hint: 'media 5 min' }),
    critical: createKpi({ label: 'Critici', format: fmtInt, hint: 'priorità 1', tone: 'danger' }),
    resp: createKpi({ label: 'Risposta media', format: fmtDuration, hint: 'tempo di invio', animate: false }),
  };

  const crumbList = h('ol', { class: 'crumbs__list' });
  const crumbs = new KeyedList<Crumb & { key: string }>(
    crumbList,
    (c) => c.key,
    () => {
      const btn = h('button', { class: 'crumbs__btn', attrs: { type: 'button' } });
      const cur = h('span', { class: 'crumbs__cur', attrs: { 'aria-current': 'page' } });
      const li = h('li', { class: 'crumbs__item' });
      let onClick: (() => void) | null = null;
      btn.addEventListener('click', () => onClick?.());
      return {
        el: li,
        update(c) {
          onClick = () => ctx.navigate(c.target);
          const node = c.current ? cur : btn;
          setText(node, c.label);
          if (li.firstChild !== node) li.replaceChildren(node);
        },
      };
    },
  );

  const connDot = h('span', { class: 'conn__dot', attrs: { 'aria-hidden': 'true' } });
  const connText = h('span', { class: 'conn__text' });
  const conn = h('span', { class: 'conn', attrs: { role: 'status' } }, connDot, connText);
  const sim = h('span', {
    class: 'badge badge--sim',
    text: 'DATI SIMULATI',
    attrs: { title: 'Non esiste un feed 911 nazionale pubblico: i dati sono generati da un simulatore.' },
  });
  const menuBtn = h('button', {
    class: 'btn btn--menu',
    text: 'Aggregati',
    attrs: { type: 'button', 'aria-controls': 'sidebar', 'aria-expanded': 'false' },
    on: { click: () => layout.toggleSidebar() },
  });
  const live = h('p', { class: 'sr-only', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' } });

  const kpiList = h(
    'dl',
    { class: 'kpis', attrs: { 'aria-label': 'Indicatori nazionali' } },
    kpis.active.el,
    kpis.last24h.el,
    kpis.rate.el,
    kpis.critical.el,
    kpis.resp.el,
  );

  const crumbNav = h('nav', { class: 'crumbs', attrs: { 'aria-label': 'Percorso di navigazione' } }, crumbList);
  const wrap = h(
    'div',
    { class: 'hdr' },
    h('div', { class: 'hdr__brand' }, h('span', { class: 'hdr__logo', text: '911', attrs: { 'aria-hidden': 'true' } }), h('h1', { class: 'hdr__title', text: 'Live 911 View' })),
    crumbNav,
    h('div', { class: 'hdr__status' }, sim, conn, menuBtn),
    kpiList,
    live,
  );
  root.replaceChildren(wrap);

  let lastAnnounce = 0;

  function renderCrumbs(): void {
    const sel = normalizeSelection(store.selection, store.incidents);
    const stateName = sel.state ? store.summary?.byState.find((s) => s.code === sel.state)?.name : undefined;
    const inc = sel.incidentId ? store.incidents.get(sel.incidentId) : undefined;
    const list = buildCrumbs(sel, {
      state: stateName,
      city: sel.cityId ? ctx.cityNames.get(sel.cityId) : undefined,
      incident: sel.incidentId
        ? `${inc ? TYPE_META[inc.type].label : 'Incidente'} ${shortId(sel.incidentId)}`
        : undefined,
    }).map((c, i) => ({ ...c, key: String(i) }));
    crumbs.update(list);
    crumbNav.scrollLeft = crumbNav.scrollWidth; // su mobile mostra sempre l'ultimo livello
  }

  function renderKpis(): void {
    const s = store.summary;
    kpis.active.set(s ? s.active : null);
    kpis.last24h.set(s ? s.last24h : null);
    kpis.rate.set(s ? s.ratePerMin : null);
    kpis.critical.set(s ? s.critical : null);
    kpis.resp.set(s ? s.avgResponseSec : null);
    if (s && Date.now() - lastAnnounce > 30_000) {
      lastAnnounce = Date.now();
      setText(live, `${fmtInt(s.active)} incidenti attivi, ${fmtInt(s.critical)} critici.`);
    }
  }

  function renderConn(): void {
    setText(connText, CONN_LABEL[store.connection]);
    for (const k of ['live', 'connecting', 'reconnecting'] as const) toggleClass(conn, `conn--${k}`, store.connection === k);
  }

  const throttled = rafThrottle(() => {
    renderKpis();
    renderCrumbs();
    renderConn();
  });
  const unsub = store.subscribe((e: StoreEvent) => {
    if (e.kind === 'incident') return;
    throttled.run();
  });
  const unNames = ctx.onNames(throttled.run);
  const syncExpanded = (): void => setAttr(menuBtn, 'aria-expanded', layout.sidebarOpen() ? 'true' : 'false');
  document.addEventListener('click', syncExpanded);
  document.addEventListener('keydown', syncExpanded);
  renderKpis();
  renderCrumbs();
  renderConn();

  return {
    destroy() {
      unsub();
      unNames();
      throttled.cancel();
      document.removeEventListener('click', syncExpanded);
      document.removeEventListener('keydown', syncExpanded);
      Object.values(kpis).forEach((k) => k.destroy());
      root.replaceChildren();
    },
  };
}
