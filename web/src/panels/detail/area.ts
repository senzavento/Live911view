import type { AreaDetail, IntersectionSummary } from '@live911/shared';
import { Resource } from '../api';
import { createTypeBars } from '../charts/bars';
import { createStackedArea } from '../charts/stacked-area';
import type { Ctx } from '../ctx';
import { h, rafThrottle, setText } from '../dom';
import { fmtDuration, fmtInt } from '../format';
import { createRanking, type RankItem } from '../ranking';
import { activeCount, visibleTypes } from '../scope';
import { createKpiGrid, createShell, section, type View } from './common';

/** Hotspot: incroci per chiamate attive (anche senza `proactive`), poi ultime 24 h. */
export function rankIntersections(list: readonly IntersectionSummary[], hideProactive: boolean): RankItem[] {
  const rows = list
    .map((i) => ({ i, v: activeCount(i, hideProactive) }))
    .sort((a, b) => b.v - a.v || b.i.last24h - a.i.last24h || a.i.name.localeCompare(b.i.name, 'it'));
  const max = Math.max(1, ...rows.map((r) => r.v));
  return rows.map(({ i, v }) => ({
    key: i.id,
    name: i.name,
    tag: `${fmtInt(i.last24h)} in 24 h`,
    valueText: fmtInt(v),
    pct: Math.round((v / max) * 100),
    critical: i.critical,
  }));
}

export function createAreaView(ctx: Ctx, areaId: string): View {
  const { store } = ctx;
  const title = h('h2', { class: 'detail__title', text: ctx.areaName(areaId) ?? areaId });
  const grid = createKpiGrid(
    {
      active: { label: 'Attive', format: fmtInt },
      critical: { label: 'Critiche', format: fmtInt, tone: 'danger' },
      last24h: { label: 'Ultime 24 h', format: fmtInt },
      resp: { label: 'Ricezione → invio', format: fmtDuration, animate: false },
    },
    'Indicatori del quartiere',
  );
  const bars = createTypeBars();
  const chart = createStackedArea('Chiamate per ora nel quartiere, ultime 24 ore');
  const rank = createRanking((id) => ctx.navigate({ areaId, intersectionId: id }), 'Incroci con più chiamate');
  const empty = h('p', { class: 'empty', text: 'Nessun incrocio con chiamate nel periodo.' });
  const shell = createShell(() => res.retry(), 'Quartiere');
  shell.content.append(
    grid.el,
    section('Attive per categoria', bars.el),
    section('Ultime 24 ore', chart.el),
    section('Incroci con più chiamate', rank.el, empty),
  );

  let data: AreaDetail | null = null;
  const res = new Resource<AreaDetail>(
    (signal) => ctx.api.area(areaId, signal),
    (s) => {
      shell.setStatus(s);
      if (s.status === 'ready') {
        data = s.data;
        ctx.setAreaName(areaId, s.data.name);
        for (const i of s.data.intersections) ctx.setIntersectionName(i.id, i.name);
        render();
      }
    },
    15_000,
  );

  function render(): void {
    if (!data) return;
    const hide = ctx.hideProactive();
    // KPI principali: preferisci il summary SSE (ogni 5 s) ai dati dell'ultimo fetch
    const live = store.summary?.byArea.find((a) => a.id === areaId) ?? data;
    setText(title, data.name);
    grid.kpis['active']?.set(live.active);
    grid.kpis['critical']?.set(live.critical);
    grid.kpis['last24h']?.set(live.last24h);
    grid.kpis['resp']?.set(data.avgDispatchSec);
    bars.update(live.byType, null, hide ? ['proactive'] : []);
    chart.update(data.timeline, visibleTypes(hide));
    const items = rankIntersections(data.intersections, hide);
    rank.update(items);
    empty.hidden = items.length > 0;
  }

  const throttled = rafThrottle(render);
  const unsub = store.subscribe((e) => {
    if (e.kind === 'summary' || e.kind === 'snapshot') throttled.run();
  });
  const unPrefs = ctx.onPrefs(throttled.run);
  shell.setStatus({ status: 'loading' });
  res.start();

  return {
    el: h('div', { class: 'view' }, title, shell.el),
    destroy() {
      unsub();
      unPrefs();
      throttled.cancel();
      res.destroy();
      grid.destroy();
    },
  };
}
