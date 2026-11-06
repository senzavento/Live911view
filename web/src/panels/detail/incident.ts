import { isLive, PRIORITY_LABEL, TYPE_META, type Incident } from '@live911/shared';
import { ApiError } from '../api';
import type { Ctx } from '../ctx';
import { h, setAttr, setText, toggleClass } from '../dom';
import { STATUS_LABEL, fmtDuration, fmtElapsed, fmtTime, fmtTimeTz } from '../format';
import type { View } from './common';

export type StepKey = 'received' | 'dispatched' | 'on_scene' | 'resolved';
const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: 'received', label: 'Ricevuta' },
  { key: 'dispatched', label: 'Inviata' },
  { key: 'on_scene', label: 'Sul posto' },
  { key: 'resolved', label: 'Risolta' },
];

export interface StepInfo {
  key: StepKey;
  label: string;
  state: 'done' | 'current' | 'todo';
  time: string | null;
}

/** Stato degli step ricevuta → invio → sul posto → risolta (funzione pura). */
export function stepInfo(inc: Incident): StepInfo[] {
  const times: Record<StepKey, string | null> = {
    received: inc.createdAt,
    dispatched: inc.dispatchedAt ?? null,
    on_scene: inc.onSceneAt ?? null,
    resolved: inc.resolvedAt ?? null,
  };
  let lastDone = -1;
  STEPS.forEach((s, i) => {
    if (times[s.key]) lastDone = i;
  });
  const resolved = !isLive(inc.status);
  return STEPS.map((s, i) => ({
    key: s.key,
    label: s.label,
    time: times[s.key],
    state: times[s.key] ? (i === lastDone && !resolved ? 'current' : 'done') : 'todo',
  }));
}

export function elapsedMs(inc: Incident, now = Date.now()): number {
  const end = inc.resolvedAt ? Date.parse(inc.resolvedAt) : now;
  return end - Date.parse(inc.createdAt);
}

export function originText(inc: Incident): string {
  return inc.officerInitiated ? 'Iniziata dall’agente (pattuglia)' : 'Da chiamata 911';
}

export function createIncidentView(ctx: Ctx, id: string): View {
  const { store } = ctx;
  let current: Incident | null = store.incidents.get(id) ?? null;
  let missing = false;
  let loading = current === null;
  const ctrl = new AbortController();
  if (current) ctx.remember(current);

  const message = h('p', { class: 'status__msg', attrs: { role: 'status' } });
  const banner = h('p', { class: 'banner', attrs: { role: 'status' } });
  const typeEl = h('h2', { class: 'detail__title' });
  const chipP = h('span', { class: 'chip' });
  const chipS = h('span', { class: 'chip chip--status' });
  const head = h('div', { class: 'inc-head' }, typeEl, h('div', { class: 'inc-head__chips' }, chipP, chipS));
  const steps = h('ol', { class: 'steps', attrs: { 'aria-label': 'Avanzamento della chiamata (ora di San Francisco)' } });
  const stepEls = STEPS.map((s) => {
    const time = h('span', { class: 'steps__time' });
    const li = h('li', { class: 'steps__item' }, h('span', { class: 'steps__dot', attrs: { 'aria-hidden': 'true' } }), h('span', { class: 'steps__label', text: s.label }), time);
    steps.append(li);
    return { li, time };
  });
  const facts = h('dl', { class: 'facts' });
  const fact = (label: string, node?: HTMLElement): HTMLElement => {
    const dd = node ?? h('dd', { class: 'facts__v' });
    if (node) node.classList.add('facts__v');
    facts.append(h('div', { class: 'facts__row' }, h('dt', { class: 'facts__k', text: label }), dd));
    return dd;
  };
  const linkBtn = (onClick: () => void): HTMLButtonElement => h('button', { class: 'linkbtn', attrs: { type: 'button' }, on: { click: onClick } });
  const ixBtn = linkBtn(() => current && ctx.navigate({ areaId: current.areaId, intersectionId: current.intersectionId }));
  const areaBtn = linkBtn(() => current && ctx.navigate({ areaId: current.areaId }));
  const fDesc = fact('Descrizione');
  fact('Incrocio', h('dd', {}, ixBtn));
  fact('Quartiere', h('dd', {}, areaBtn));
  const fAgency = fact('Agenzia');
  const fOrigin = fact('Origine');
  const fRecv = fact('Ricevuta');
  const fUpd = fact('Ultimo aggiornamento');
  const fResp = fact('Ricezione → invio');
  const posNote = h('p', { class: 'note card__note', text: 'Posizione approssimata all’incrocio (già mascherata dalla fonte). Dati con ritardo di ~10-20 min.' });
  const elapsedLabel = h('span', { class: 'elapsed__k' });
  const elapsedVal = h('span', { class: 'elapsed__v' });
  const elapsed = h('div', { class: 'elapsed' }, elapsedLabel, elapsedVal);
  const card = h('article', { class: 'card' }, banner, head, elapsed, steps, facts, posNote);
  const root = h('div', { class: 'view' }, message, card);

  function render(): void {
    message.hidden = !(loading || (missing && !current));
    if (loading) setText(message, 'Caricamento della chiamata…');
    else if (missing && !current) {
      setText(message, 'Chiamata non trovata: potrebbe essere uscita dalla finestra di 48 ore della fonte, oppure l’identificativo non è valido.');
    }
    card.hidden = !current;
    if (!current) return;
    const inc = current;
    const meta = TYPE_META[inc.type];
    card.style.setProperty('--c', meta.color);
    setText(typeEl, `${meta.icon} ${meta.label}`);
    setText(chipP, `Priorità ${PRIORITY_LABEL[inc.priority].toLowerCase()}`);
    setAttr(chipP, 'class', `chip chip--p${inc.priority}`);
    setText(chipS, STATUS_LABEL[inc.status]);
    const resolved = !isLive(inc.status);
    banner.hidden = !resolved;
    setText(
      banner,
      !resolved
        ? ''
        : inc.status === 'expired'
          ? `Nessun aggiornamento dalle ${fmtTimeTz(inc.updatedAt)}: la fonte non ha registrato la chiusura. Non è più considerata in corso.`
          : `Chiamata risolta alle ${fmtTimeTz(inc.resolvedAt ?? inc.updatedAt)}. Non è più attiva sulla mappa.`,
    );
    toggleClass(card, 'is-resolved', resolved);
    stepInfo(inc).forEach((s, i) => {
      const el = stepEls[i];
      if (!el) return;
      setAttr(el.li, 'class', `steps__item steps__item--${s.state}`);
      setAttr(el.li, 'aria-current', s.state === 'current' ? 'step' : null);
      setText(el.time, s.time ? fmtTime(s.time, true) : s.state === 'todo' ? (resolved ? '–' : 'in attesa') : '–');
    });
    setText(fDesc, inc.description);
    setText(ixBtn, inc.address);
    setText(areaBtn, inc.areaName);
    setText(fAgency, inc.agency);
    setText(fOrigin, originText(inc));
    setText(fRecv, fmtTimeTz(inc.createdAt, true));
    setText(fUpd, fmtTimeTz(inc.resolvedAt ?? inc.updatedAt, true));
    const resp = inc.dispatchedAt ? (Date.parse(inc.dispatchedAt) - Date.parse(inc.createdAt)) / 1000 : null;
    setText(fResp, resp === null ? 'n/d' : inc.officerInitiated ? `${fmtDuration(Math.max(0, resp))} (iniziata dall’agente)` : fmtDuration(Math.max(0, resp)));
    setText(elapsedLabel, resolved ? 'Durata' : 'Tempo trascorso');
    tick();
  }

  function tick(): void {
    if (current) setText(elapsedVal, fmtElapsed(elapsedMs(current)));
  }

  const unsub = store.subscribe((e) => {
    if (e.kind !== 'incident' || e.incident.id !== id) return;
    current = e.incident; // anche l'evento "resolved" porta lo stato finale
    ctx.remember(current);
    missing = false;
    loading = false;
    render();
  });
  const timer = setInterval(() => {
    if (current && isLive(current.status)) tick();
  }, 1000);

  // Risolta o fuori dallo store: GET /api/incidents/:id
  if (!current) {
    ctx.api
      .incident(id, ctrl.signal)
      .then((inc) => {
        if (ctrl.signal.aborted) return;
        current = current ?? inc;
        ctx.remember(current);
        loading = false;
        render();
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        loading = false;
        missing = true;
        render();
        if (!(err instanceof ApiError) || err.status !== 404) {
          message.hidden = false;
          setText(message, 'Impossibile caricare la chiamata: server non raggiungibile. Riprova tra poco.');
        }
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
