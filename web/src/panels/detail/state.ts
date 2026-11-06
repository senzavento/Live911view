import type { StateDetail } from '@live911/shared';
import { Resource } from '../api';
import { createTypeBars } from '../charts/bars';
import type { Ctx } from '../ctx';
import { h, rafThrottle, setText } from '../dom';
import { fmtDecimal, fmtInt } from '../format';
import { createRanking, type RankItem } from '../ranking';
import { createKpiGrid, createShell, section, type View } from './common';

export function cityRank(data: StateDetail): RankItem[] {
  const rows = data.cities.slice().sort((a, b) => b.active - a.active || a.city.name.localeCompare(b.city.name, 'it'));
  const max = Math.max(1, ...rows.map((r) => r.active));
  return rows.map((c) => ({
    key: c.city.id,
    name: c.city.name,
    tag: c.critical ? `${fmtInt(c.critical)} crit.` : '',
    valueText: fmtInt(c.active),
    pct: Math.round((c.active / max) * 100),
  }));
}

export function createStateView(ctx: Ctx, code: string): View {
  const { store } = ctx;
  const title = h('h2', { class: 'detail__title', text: code });
  const grid = createKpiGrid(
    {
      active: { label: 'Attivi', format: fmtInt },
      critical: { label: 'Critici', format: fmtInt, tone: 'danger' },
      per100k: { label: 'Ogni 100k ab.', format: fmtDecimal },
      cities: { label: 'Città', format: fmtInt, animate: false },
    },
    `Indicatori ${code}`,
  );
  const bars = createTypeBars();
  const rank = createRanking((id) => ctx.navigate({ state: code, cityId: id }), `Classifica città di ${code}`);
  const empty = h('p', { class: 'empty', text: 'Nessuna città monitorata.' });

  const shell = createShell(() => res.retry(), 'Stato');
  shell.content.append(grid.el, section('Per tipologia', bars.el), section('Città per incidenti attivi', rank.el, empty));

  let data: StateDetail | null = null;
  const res = new Resource<StateDetail>(
    (signal) => ctx.api.state(code, signal),
    (s) => {
      shell.setStatus(s);
      if (s.status === 'ready') {
        data = s.data;
        for (const c of s.data.cities) ctx.setCityName(c.city.id, c.city.name);
        render();
      }
    },
    10_000,
  );

  function render(): void {
    if (!data) return;
    // numeri di stato: preferisci il summary SSE (ogni 2 s) ai dati del fetch
    const live = store.summary?.byState.find((s) => s.code === code) ?? data;
    setText(title, data.name);
    grid.kpis['active']?.set(live.active);
    grid.kpis['critical']?.set(live.critical);
    grid.kpis['per100k']?.set(live.per100k);
    grid.kpis['cities']?.set(data.cities.length);
    bars.update(live.byType);
    const items = cityRank(data);
    rank.update(items);
    empty.hidden = items.length > 0;
  }

  const throttled = rafThrottle(render);
  const unsub = store.subscribe((e) => {
    if (e.kind === 'summary' || e.kind === 'snapshot') throttled.run();
  });
  const nameFromSummary = store.summary?.byState.find((s) => s.code === code)?.name;
  if (nameFromSummary) setText(title, nameFromSummary);
  shell.setStatus({ status: 'loading' });
  res.start();

  return {
    el: h('div', { class: 'view' }, title, shell.el),
    destroy() {
      unsub();
      throttled.cancel();
      res.destroy();
      grid.destroy();
    },
  };
}
