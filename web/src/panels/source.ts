import type { SourceStatus } from '@live911/shared';
import { fmtDelay, fmtTimeTz, truncate } from './format';

/** Oltre questo ritardo i dati sono considerati obsoleti. */
export const STALE_AFTER_SEC = 30 * 60;

export type SourceState = 'ok' | 'error' | 'stale' | 'pending';

export interface SourceHealth {
  state: SourceState;
  /** etichetta breve (testo, non solo colore) */
  label: string;
  /** spiegazione estesa */
  detail: string;
  /** ritardo calcolato rispetto a `now` (o, in mancanza di dataAsOf, quello dichiarato) */
  delaySec: number | null;
  /** "Dati delle 14:20 PST" oppure null */
  asOfText: string | null;
}

/**
 * Stato della sorgente per la UI. `delaySec` è ricalcolato da `dataAsOf`: se il server si ferma
 * il ritardo continua a crescere e la sorgente diventa "obsoleta".
 */
export function sourceHealth(src: SourceStatus | null | undefined, now = Date.now()): SourceHealth {
  if (!src) {
    return { state: 'pending', label: 'In attesa dei dati', detail: 'Il server non ha ancora inviato lo stato della sorgente.', delaySec: null, asOfText: null };
  }
  const asOfMs = src.dataAsOf ? Date.parse(src.dataAsOf) : Number.NaN;
  const hasAsOf = Number.isFinite(asOfMs);
  const delaySec = hasAsOf ? Math.max(0, Math.round((now - asOfMs) / 1000)) : src.delaySec;
  const asOfText = hasAsOf ? `Dati delle ${fmtTimeTz(asOfMs)}` : null;
  const stale = delaySec !== null && delaySec > STALE_AFTER_SEC;
  if (!src.ok) {
    const why = src.lastError ? ` (${truncate(src.lastError, 120)})` : '';
    return {
      state: 'error',
      label: 'Errore sorgente',
      detail: `L'ultimo aggiornamento da ${src.name} non è riuscito${why}.${stale ? ' I dati mostrati sono obsoleti.' : ' I dati mostrati potrebbero non essere aggiornati.'}`,
      delaySec,
      asOfText,
    };
  }
  if (!hasAsOf && delaySec === null) {
    return { state: 'pending', label: 'In attesa del primo caricamento', detail: `${src.name}: nessun dato ancora caricato.`, delaySec, asOfText };
  }
  if (stale) {
    return {
      state: 'stale',
      label: 'Dati obsoleti',
      detail: `Ritardo di ${fmtDelay(delaySec ?? 0)}, oltre la soglia di ${STALE_AFTER_SEC / 60} min: la fonte non si aggiorna come previsto.`,
      delaySec,
      asOfText,
    };
  }
  return { state: 'ok', label: 'Sorgente attiva', detail: `Dati da ${src.name}, aggiornati con il ritardo tipico della fonte.`, delaySec, asOfText };
}

/** Simbolo testuale per stato (affianca il colore, non lo sostituisce). */
export const SOURCE_ICON: Record<SourceState, string> = { ok: '●', error: '✕', stale: '▲', pending: '…' };

/** Solo URL http(s): evita link `javascript:` se la sorgente fosse compromessa. */
export function safeUrl(url: string | undefined, fallback: string): string {
  try {
    const u = new URL(url ?? '');
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : fallback;
  } catch {
    return fallback;
  }
}

export const DATASF_URL = 'https://data.sf.gov/d/gnap-fj3t';
export const PDDL_URL = 'https://opendatacommons.org/licenses/pddl/1-0/';
