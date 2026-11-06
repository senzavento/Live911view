import { PRIORITY_LABEL, TYPE_META, type Incident, type IncidentStatus } from '@live911/shared';
import { ApiError } from '../api';
import type { Ctx } from '../ctx';
import { h, setAttr, setText, toggleClass } from '../dom';
import { STATUS_LABEL, fmtElapsed, fmtInt, fmtTime } from '../format';
import type { View } from './common';

const STEPS: IncidentStatus[] = ['dispatched', 'on_scene', 'resolved'];

export interface StepInfo {
  status: IncidentStatus;
  state: 'done' | 'current' | 'todo';
  time: string | null;
}

/** Stato degli step della timeline dispatched → on_scene → resolved (funzione pura). */
export function stepInfo(inc: Incident): StepInfo[] {
  const idx = STEPS.indexOf(inc.status);
  return STEPS.map((status, i) => {
    let time: string | null = null;
    if (status === 'dispatched') time = inc.createdAt;
    else if (status === 'on_scene' && inc.status === 'on_scene') time = inc.updatedAt;
    else if (status === 'resolved') time = inc.resolvedAt ?? null;
    // risolto saltando lo step "sul posto": lo consideriamo comunque completato
    return { status, state: i < idx ? 'done' : i === idx ? (status === 'resolved' ? 'done' : 'current') : 'todo', time };
  });
}

export function elapsedMs(inc: Incident, now = Date.now()): number {
  const end = inc.resolvedAt ? Date.parse(inc.resolvedAt) : now;
  return end - Date.parse(inc.createdAt);
}

export function createIncidentView(ctx: Ctx, id: string): View {
  const { store } = ctx;
  let current: Incident | null = store.incidents.get(id) ?? null;
  let missing = false;
  let loading = current === null;
  const ctrl = new AbortController();

  const banner = h('p', { class: 'banner', attrs: { role: 'status' } });
  const head = h('div', { class: 'inc-head' });
  const typeEl = h('h2', { class: 'detail__title' });
  const chipP = h('span', { class: 'chip' });
  const chipS = h('span', { class: 'chip chip--status' });
  const steps = h('ol', { class: 'steps', attrs: { 'aria-label': 'Avanzamento intervento' } });
  const stepEls = STEPS.map((s) => {
    const time = h('span', { class: 'steps__time' });
    const li = h('li', { class: 'steps__item' }, h('span', { class: 'steps__dot', attrs: { 'aria-hidden': 'true' } }), h('span', { class: 'steps__label', text: STATUS_LABEL[s] }), time);
    steps.append(li);
    return { li, time };
  });
  const facts = h('dl', { class: 'facts' });
  const fact = (label: string): HTMLElement => {
    const dd = h('dd', { class: 'facts__v' });
    facts.append(h('div', { class: 'facts__row' }, h('dt', { class: 'facts__k', text: label }), dd));
    return dd;
  };
  const fAddr = fact('Indirizzo (isolato)');
  const fDesc = fact('Descrizione');
  const fUnits = fact('Unità assegnate');
  const fOpen = fact('Aperto alle');
  const fUpd = fact('Ultimo aggiornamento');
  const elapsedLabel = h('span', { class: 'elapsed__k' });
  const elapsedVal = h('span', { class: 'elapsed__v' });
  const elapsed = h('div', { class: 'elapsed' }, elapsedLabel, elapsedVal);
  const status = h('p', { class: 'status__msg' });
  const card = h('article', { class: 'card' }, banner, head, elapsed, steps, facts);
  head.append(typeEl, h('div', { class: 'inc-head__chips' }, chipP, chipS));
  const root = h('div', { class: 'view' }, status, card);

  function render(): void {
    status.hidden = !(loading || (missing && !current));
    if (loading) setText(status, 'Caricamento incidente…');
    else if (missing && !current) setText(status, 'Incidente non più presente (identificativo sconosciuto o scaduto).');
    card.hidden = !current;
    if (!current) return;
    const inc = current;
    const meta = TYPE_META[inc.type];
    card.style.setProperty('--c', meta.color);
    setText(typeEl, `${meta.icon} ${meta.label}`);
    setText(chipP, `Priorità ${PRIORITY_LABEL[inc.priority].toLowerCase()}`);
    setAttr(chipP, 'class', `chip chip--p${inc.priority}`);
    setText(chipS, STATUS_LABEL[inc.status]);
    const resolved = inc.status === 'resolved';
    const gone = !store.incidents.has(inc.id);
    banner.hidden = !(resolved || gone);
    setText(
      banner,
      resolved
        ? `Intervento risolto alle ${fmtTime(inc.resolvedAt ?? inc.updatedAt)}. Non è più attivo sulla mappa.`
        : 'Questo incidente non risulta più tra quelli attivi.',
    );
    toggleClass(card, 'is-resolved', resolved);
    stepInfo(inc).forEach((s, i) => {
      const el = stepEls[i];
      if (!el) return;
      setAttr(el.li, 'class', `steps__item steps__item--${s.state}`);
      setAttr(el.li, 'aria-current', s.state === 'current' ? 'step' : null);
      setText(el.time, s.time ? fmtTime(s.time) : s.state === 'todo' ? 'in attesa' : '–');
    });
    setText(fAddr, inc.address);
    setText(fDesc, inc.description);
    setText(fUnits, fmtInt(inc.unitsAssigned));
    setText(fOpen, fmtTime(inc.createdAt, true));
    setText(fUpd, fmtTime(inc.resolvedAt ?? inc.updatedAt, true));
    setText(elapsedLabel, resolved ? 'Durata intervento' : 'Tempo trascorso');
    tick();
  }

  function tick(): void {
    if (current) setText(elapsedVal, fmtElapsed(elapsedMs(current)));
  }

  const unsub = store.subscribe((e) => {
    if (e.kind !== 'incident' || e.incident.id !== id) return;
    current = e.incident; // anche l'evento "resolved" porta lo stato finale
    missing = false;
    loading = false;
    render();
  });
  const timer = setInterval(tick, 1000);

  if (!current) {
    ctx.api
      .incident(id, ctrl.signal)
      .then((inc) => {
        current = current ?? inc;
        loading = false;
        render();
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        loading = false;
        missing = true;
        if (!(err instanceof ApiError) || err.status !== 404) setText(status, 'Impossibile caricare l’incidente.');
        render();
      });
  }
  render();

  return {
    el: root,
    destroy() {
      unsub();
      clearInterval(timer);
      ctrl.abort();
    },
  };
}
