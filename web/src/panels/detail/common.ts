import type { LoadState } from '../api';
import { h, setText } from '../dom';
import { createKpi, type Kpi } from '../kpi';

export interface View {
  el: HTMLElement;
  destroy(): void;
}

export interface Shell {
  el: HTMLElement;
  /** contenitore del contenuto, visibile solo quando i dati sono pronti */
  content: HTMLElement;
  setStatus(s: LoadState<unknown>): void;
}

/** Gestisce gli stati loading / errore (con retry) / pronto di una vista che carica dati. */
export function createShell(onRetry: () => void, noun: string): Shell {
  const msg = h('p', { class: 'status__msg' });
  const retry = h('button', { class: 'btn', text: 'Riprova', attrs: { type: 'button' }, on: { click: onRetry } });
  const status = h('div', { class: 'status', attrs: { role: 'status' } }, msg, retry);
  const content = h('div', { class: 'content' });
  const el = h('div', { class: 'shell' }, status, content);
  return {
    el,
    content,
    setStatus(s) {
      const ready = s.status === 'ready';
      content.hidden = !ready;
      status.hidden = ready;
      el.setAttribute('aria-busy', s.status === 'loading' ? 'true' : 'false');
      if (s.status === 'error') {
        status.setAttribute('role', 'alert');
        status.classList.add('status--error');
        setText(msg, s.notFound ? `${noun}: non trovato.` : `${noun}: ${s.message}.`);
        retry.hidden = false;
      } else if (!ready) {
        status.setAttribute('role', 'status');
        status.classList.remove('status--error');
        setText(msg, `Caricamento ${noun.toLowerCase()}…`);
        retry.hidden = true;
      }
    },
  };
}

export interface KpiGrid {
  el: HTMLElement;
  kpis: Record<string, Kpi>;
  destroy(): void;
}

export function createKpiGrid(defs: Record<string, Parameters<typeof createKpi>[0]>, label: string): KpiGrid {
  const kpis: Record<string, Kpi> = {};
  const count = Object.keys(defs).length;
  const el = h('dl', { class: 'kpis kpis--panel', attrs: { 'aria-label': label }, vars: { '--cols': String(count === 3 ? 3 : 2) } });
  for (const [k, d] of Object.entries(defs)) {
    const kpi = createKpi(d);
    kpis[k] = kpi;
    el.append(kpi.el);
  }
  return { el, kpis, destroy: () => Object.values(kpis).forEach((k) => k.destroy()) };
}

export function section(title: string, ...body: Array<Node | null>): HTMLElement {
  return h('section', { class: 'sec' }, h('h3', { class: 'sec__title', text: title }), ...body);
}
