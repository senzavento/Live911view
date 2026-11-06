import { TYPE_META } from '@live911/shared';
import type { ConnectionStatus, StoreEvent } from '../store';
import type { Ctx, Part } from './ctx';
import { KeyedList, h, rafThrottle, setAttr, setText, toggleClass } from './dom';
import { fmtDelay, fmtDuration, fmtInt, shortId } from './format';
import { createKpi } from './kpi';
import type { Layout } from './layout';
import { buildCrumbs, normalizeSelection, type Crumb } from './nav';
import { createDataNote } from './notes';
import { SOURCE_ICON, sourceHealth } from './source';

const CONN_LABEL: Record<ConnectionStatus, string> = {
  live: 'Flusso live attivo',
  connecting: 'Connessione…',
  reconnecting: 'Riconnessione…',
};

const ANNOUNCE_EVERY_MS = 30_000;
const FRESHNESS_TICK_MS = 15_000;

export function createHeader(root: HTMLElement, ctx: Ctx, layout: Layout): Part {
  const { store } = ctx;
  const prevLabel = root.getAttribute('aria-label');
  root.setAttribute('aria-label', 'Indicatori di San Francisco');

  const kpis = {
    active: createKpi({ label: 'Attive', format: fmtInt, hint: 'chiamate non risolte' }),
    last24h: createKpi({ label: 'Ultime 24 h', format: fmtInt, hint: 'chiamate ricevute' }),
    rate: createKpi({ label: 'Chiamate / ora', format: fmtInt, hint: 'ultima ora' }),
    critical: createKpi({ label: 'Critiche', format: fmtInt, hint: 'priorità 1', tone: 'danger' }),
    resp: createKpi({ label: 'Ricezione → invio', format: fmtDuration, hint: 'tempo medio', animate: false }),
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

  // Badge di trasparenza: sempre visibile, mai sostituibile con "istantaneo".
  const badge = h('span', {
    class: 'badge badge--real',
    text: 'DATI REALI · ritardo ~10-20 min · fonte DataSF',
    attrs: { title: 'Dati pubblici reali di DataSF (polizia, sceriffo, MTA, HEART), pubblicati con 10-20 minuti di ritardo.' },
  });

  const menuBtn = h('button', {
    class: 'btn btn--menu',
    text: 'Aggregati',
    attrs: { type: 'button', 'aria-controls': 'sidebar', 'aria-expanded': 'false' },
    on: { click: () => layout.toggleSidebar() },
  });
  const live = h('p', { class: 'sr-only', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' } });

  const srcIcon = h('span', { class: 'src__icon', attrs: { 'aria-hidden': 'true' } });
  const srcLabel = h('strong', { class: 'src__label' });
  const srcAsOf = h('span', { class: 'src__asof' });
  const srcDelay = h('span', { class: 'src__delay' });
  const srcState = h('span', { class: 'src__state' }, srcIcon, srcLabel);
  const srcLine = h('div', { class: 'src', attrs: { role: 'group', 'aria-label': 'Stato della sorgente dati' } },
    srcState, srcAsOf, srcDelay);
  const srcWarn = h('p', { class: 'src__warn' });

  const kpiList = h(
    'dl',
    { class: 'kpis', attrs: { 'aria-label': 'Indicatori di San Francisco' } },
    kpis.active.el,
    kpis.last24h.el,
    kpis.rate.el,
    kpis.critical.el,
    kpis.resp.el,
  );
  const note = createDataNote('hdr__note');

  const crumbNav = h('nav', { class: 'crumbs', attrs: { 'aria-label': 'Percorso di navigazione' } }, crumbList);
  const wrap = h(
    'div',
    { class: 'hdr' },
    h(
      'div',
      { class: 'hdr__brand' },
      h('span', { class: 'hdr__logo', text: '911', attrs: { 'aria-hidden': 'true' } }),
      h('h1', { class: 'hdr__title', text: 'Live 911 View · San Francisco' }),
    ),
    crumbNav,
    h('div', { class: 'hdr__status' }, conn, menuBtn),
    h('div', { class: 'hdr__trust' }, badge, srcLine),
    srcWarn,
    kpiList,
    note.el,
    live,
  );
  root.replaceChildren(wrap);

  let lastAnnounce = 0;

  function renderCrumbs(): void {
    const sel = normalizeSelection(store.selection, ctx.lookupIncident);
    const inc = sel.incidentId ? ctx.lookupIncident(sel.incidentId) : undefined;
    const list = buildCrumbs(sel, {
      area: sel.areaId ? ctx.areaName(sel.areaId) : undefined,
      intersection: sel.intersectionId ? ctx.intersectionName(sel.intersectionId) : undefined,
      incident: sel.incidentId ? `${inc?.type ? TYPE_META[inc.type].label : 'Chiamata'} ${shortId(sel.incidentId)}` : undefined,
    }).map((c, i) => ({ ...c, key: String(i) }));
    crumbs.update(list);
    crumbNav.scrollLeft = crumbNav.scrollWidth; // su mobile mostra sempre l'ultimo livello
  }

  function renderKpis(): void {
    const s = store.summary;
    if (!s) return;
    kpis.active.set(s.active);
    kpis.last24h.set(s.last24h);
    kpis.rate.set(s.ratePerHour);
    kpis.critical.set(s.critical);
    kpis.resp.set(s.avgDispatchSec);
  }

  function renderSource(): void {
    const s = store.summary;
    const hl = sourceHealth(s?.source);
    setText(srcIcon, SOURCE_ICON[hl.state]);
    setText(srcLabel, hl.label);
    setText(srcAsOf, hl.asOfText ?? 'Orario dati non disponibile');
    setText(srcDelay, hl.delaySec !== null ? `ritardo ${fmtDelay(hl.delaySec)} (ora di San Francisco)` : '');
    for (const k of ['ok', 'error', 'stale', 'pending'] as const) toggleClass(srcState, `src__state--${k}`, hl.state === k);
    const bad = hl.state === 'error' || hl.state === 'stale';
    srcWarn.hidden = !bad;
    setText(srcWarn, bad ? hl.detail : '');
    setAttr(srcWarn, 'role', bad ? 'alert' : null);
    toggleClass(wrap, 'hdr--degraded', bad);
    note.update(s);
    if (s && Date.now() - lastAnnounce > ANNOUNCE_EVERY_MS) {
      lastAnnounce = Date.now();
      const tail = bad ? ` Attenzione: ${hl.label.toLowerCase()}.` : hl.delaySec !== null ? ` Dati con ritardo di circa ${fmtDelay(hl.delaySec)}.` : '';
      setText(live, `${fmtInt(s.active)} chiamate attive, ${fmtInt(s.critical)} critiche.${tail}`);
    }
  }

  function renderConn(): void {
    setText(connText, CONN_LABEL[store.connection]);
    for (const k of ['live', 'connecting', 'reconnecting'] as const) toggleClass(conn, `conn--${k}`, store.connection === k);
  }

  const renderAll = (): void => {
    renderKpis();
    renderSource();
    renderCrumbs();
    renderConn();
  };
  const throttled = rafThrottle(renderAll);
  const unsub = store.subscribe((e: StoreEvent) => {
    if (e.kind === 'incident') return;
    throttled.run();
  });
  const unNames = ctx.onNames(throttled.run);
  // il ritardo cresce anche se non arrivano eventi: ricalcolo periodico
  const tick = setInterval(throttled.run, FRESHNESS_TICK_MS);
  const syncExpanded = (): void => setAttr(menuBtn, 'aria-expanded', layout.sidebarOpen() ? 'true' : 'false');
  document.addEventListener('click', syncExpanded);
  document.addEventListener('keydown', syncExpanded);
  renderAll();

  return {
    destroy() {
      unsub();
      unNames();
      clearInterval(tick);
      throttled.cancel();
      document.removeEventListener('click', syncExpanded);
      document.removeEventListener('keydown', syncExpanded);
      Object.values(kpis).forEach((k) => k.destroy());
      if (prevLabel === null) root.removeAttribute('aria-label');
      else root.setAttribute('aria-label', prevLabel);
      root.replaceChildren();
    },
  };
}
