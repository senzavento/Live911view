import { isLive, PRIORITY_LABEL, TYPE_META, type Incident, type IntersectionDetail } from '@live911/shared';
import { Resource } from '../api';
import { createTypeBars } from '../charts/bars';
import type { Ctx } from '../ctx';
import { KeyedList, h, rafThrottle, setAttr, setText, toggleClass } from '../dom';
import { STATUS_LABEL, fmtElapsed, fmtInt, fmtTime, priorityShort } from '../format';
import { mergeIncidents, withoutProactive } from '../scope';
import { createKpiGrid, createShell, section, type View } from './common';

const MAX_ROWS = 100;

export function createIntersectionView(ctx: Ctx, intersectionId: string, areaId?: string): View {
  const { store } = ctx;
  const title = h('h2', { class: 'detail__title', text: ctx.intersectionName(intersectionId) ?? intersectionId });
  const areaLink = h('button', { class: 'detail__sub', attrs: { type: 'button' }, on: { click: () => areaTarget && ctx.navigate({ areaId: areaTarget }) } });
  areaLink.hidden = true;
  let areaTarget: string | undefined = areaId;
  const grid = createKpiGrid(
    {
      active: { label: 'Attive', format: fmtInt },
      critical: { label: 'Critiche', format: fmtInt, tone: 'danger' },
      last24h: { label: 'Ultime 24 h', format: fmtInt },
    },
    'Indicatori dell’incrocio',
  );
  const bars = createTypeBars();
  const more = h('p', { class: 'note' });
  const empty = h('p', { class: 'empty', text: 'Nessuna chiamata recente a questo incrocio.' });
  const ul = h('ul', { class: 'inc-list', attrs: { 'aria-label': 'Chiamate: attive prima, poi risolte' } });

  const rows = new KeyedList<Incident>(
    ul,
    (i) => i.id,
    (first) => {
      const prio = h('span', { class: 'chip' });
      const type = h('span', { class: 'inc__type' });
      const when = h('span', { class: 'inc__elapsed' });
      const info = h('span', { class: 'inc__status' });
      const btn = h(
        'button',
        {
          class: 'inc__btn',
          attrs: { type: 'button' },
          on: { click: () => ctx.navigate({ areaId: first.areaId, intersectionId: first.intersectionId, incidentId: first.id }) },
        },
        h('span', { class: 'inc__top' }, prio, type, when),
        info,
      );
      const li = h('li', { class: 'inc', vars: { '--c': TYPE_META[first.type].color } }, btn);
      return {
        el: li,
        update(i) {
          const resolved = !isLive(i.status);
          setText(prio, priorityShort(i.priority));
          setAttr(prio, 'class', `chip chip--p${i.priority}`);
          setAttr(prio, 'title', `Priorità ${PRIORITY_LABEL[i.priority].toLowerCase()}`);
          setText(type, TYPE_META[i.type].label);
          when.dataset['created'] = resolved ? '' : i.createdAt;
          setText(when, resolved ? fmtTime(i.resolvedAt ?? i.updatedAt) : fmtElapsed(Date.now() - Date.parse(i.createdAt)));
          setText(info, `${STATUS_LABEL[i.status]} · ${i.agency}${i.officerInitiated ? ' · iniziata dall’agente' : ''}`);
          toggleClass(li, 'is-resolved', resolved);
          setAttr(
            btn,
            'aria-label',
            `${TYPE_META[i.type].label}, priorità ${PRIORITY_LABEL[i.priority].toLowerCase()}, ${STATUS_LABEL[i.status].toLowerCase()}, ricevuta alle ${fmtTime(i.createdAt)}`,
          );
        },
      };
    },
  );

  const shell = createShell(() => res.retry(), 'Incrocio');
  shell.content.append(grid.el, section('Attive per categoria', bars.el), section('Chiamate', ul, more, empty));

  let data: IntersectionDetail | null = null;
  const res = new Resource<IntersectionDetail>(
    (signal) => ctx.api.intersection(intersectionId, signal),
    (s) => {
      shell.setStatus(s);
      if (s.status === 'ready') {
        data = s.data;
        ctx.setIntersectionName(intersectionId, s.data.name);
        for (const i of s.data.incidents) ctx.remember(i);
        areaTarget = s.data.areaId;
        render();
      }
    },
    15_000,
  );

  function render(): void {
    if (!data) return;
    const hide = ctx.hideProactive();
    setText(title, data.name);
    const aName = areaTarget ? ctx.areaName(areaTarget) : undefined;
    areaLink.hidden = !areaTarget;
    setText(areaLink, areaTarget ? `Quartiere: ${aName ?? areaTarget}` : '');
    grid.kpis['active']?.set(data.active);
    grid.kpis['critical']?.set(data.critical);
    grid.kpis['last24h']?.set(data.last24h);
    bars.update(data.byType, null, hide ? ['proactive'] : []);
    renderList();
  }

  function renderList(): void {
    if (!data) return;
    const merged = mergeIncidents(data.incidents, store.incidents, intersectionId, store.summary !== null);
    const list = withoutProactive(merged, ctx.hideProactive());
    rows.update(list.slice(0, MAX_ROWS));
    empty.hidden = list.length > 0;
    more.hidden = list.length <= MAX_ROWS;
    setText(more, `Mostrate le prime ${MAX_ROWS} di ${fmtInt(list.length)}.`);
  }

  const throttled = rafThrottle(() => {
    render();
  });
  const unsub = store.subscribe((e) => {
    if (e.kind === 'incident' && e.incident.intersectionId === intersectionId) throttled.run();
    else if (e.kind === 'snapshot') throttled.run();
  });
  const unPrefs = ctx.onPrefs(throttled.run);
  const unNames = ctx.onNames(() => {
    const n = ctx.intersectionName(intersectionId);
    if (n) setText(title, n);
  });
  const tick = setInterval(() => {
    for (const el of ul.querySelectorAll<HTMLElement>('[data-created]')) {
      const c = el.dataset['created'];
      if (c) setText(el, fmtElapsed(Date.now() - Date.parse(c)));
    }
  }, 1000);

  shell.setStatus({ status: 'loading' });
  res.start();

  return {
    el: h('div', { class: 'view' }, title, areaLink, shell.el),
    destroy() {
      unsub();
      unPrefs();
      unNames();
      throttled.cancel();
      clearInterval(tick);
      res.destroy();
      grid.destroy();
    },
  };
}
