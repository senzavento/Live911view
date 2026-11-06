import type { CitySummary } from '@live911/shared';
import { h, setText } from './dom';
import { fmtInt } from './format';
import { DATASF_URL, PDDL_URL, safeUrl } from './source';

export interface DataNote {
  el: HTMLElement;
  update(summary: CitySummary | null): void;
}

/**
 * Nota di trasparenza: chiamate riservate non mappate, copertura (solo polizia), fonte e licenza.
 * Nessun testo proviene dalla fonte tranne il nome e l'URL (validato), mostrati come testo/link.
 */
export function createDataNote(cls: string): DataNote {
  const count = h('strong', { class: 'note__n' });
  const link = h('a', { class: 'link', text: 'DataSF', attrs: { href: DATASF_URL, target: '_blank', rel: 'noopener noreferrer' } });
  const lic = h('a', { class: 'link', text: 'PDDL', attrs: { href: PDDL_URL, target: '_blank', rel: 'noopener noreferrer' } });
  const el = h(
    'p',
    { class: `datanote ${cls}` },
    count,
    ' chiamate senza posizione (riservate) non mostrate sulla mappa — solo polizia/sceriffo/MTA/HEART, non fuoco/EMS. Fonte: ',
    link,
    ' · Licenza ',
    lic,
    '.',
  );
  return {
    el,
    update(s) {
      setText(count, s ? fmtInt(s.unlocated24h) : '–');
      if (s) {
        link.setAttribute('href', safeUrl(s.source.url, DATASF_URL));
        setText(link, s.source.name || 'DataSF');
      }
    },
  };
}
