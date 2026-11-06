import type { Incident } from '@live911/shared';
import type { Selection } from '../store';

export interface Crumb {
  label: string;
  /** Selezione da applicare al click. */
  target: Selection;
  current: boolean;
}

/** "houston-tx" → "TX" (lo slug città termina col codice stato). */
export function stateOfCityId(cityId: string): string | undefined {
  const m = /-([a-z]{2})$/i.exec(cityId);
  return m?.[1]?.toUpperCase();
}

/**
 * Completa una selezione parziale (es. solo incidentId o solo cityId) ricavando i livelli
 * superiori da incidente / slug città. Restituisce sempre una catena coerente.
 */
export function normalizeSelection(sel: Selection, incidents: ReadonlyMap<string, Incident>): Selection {
  const out: Selection = {};
  let { state, cityId } = sel;
  const incidentId = sel.incidentId;
  if (incidentId) {
    const inc = incidents.get(incidentId);
    if (inc) {
      state = state ?? inc.state;
      cityId = cityId ?? inc.cityId;
    }
  }
  if (cityId && !state) state = stateOfCityId(cityId);
  if (state) out.state = state;
  if (state && cityId) out.cityId = cityId;
  if (state && cityId && incidentId) out.incidentId = incidentId;
  return out;
}

export type Level = 0 | 1 | 2 | 3;

export function levelOf(sel: Selection): Level {
  if (sel.incidentId && sel.cityId && sel.state) return 3;
  if (sel.cityId && sel.state) return 2;
  if (sel.state) return 1;
  return 0;
}

export interface CrumbNames {
  state?: string;
  city?: string;
  incident?: string;
}

/** Breadcrumb "USA › Stato › Città › Incidente" a partire da una selezione normalizzata. */
export function buildCrumbs(sel: Selection, names: CrumbNames = {}): Crumb[] {
  const level = levelOf(sel);
  const crumbs: Crumb[] = [{ label: 'USA', target: {}, current: level === 0 }];
  if (sel.state) {
    crumbs.push({ label: names.state ?? sel.state, target: { state: sel.state }, current: level === 1 });
  }
  if (sel.state && sel.cityId) {
    crumbs.push({
      label: names.city ?? sel.cityId,
      target: { state: sel.state, cityId: sel.cityId },
      current: level === 2,
    });
  }
  if (sel.state && sel.cityId && sel.incidentId) {
    crumbs.push({
      label: names.incident ?? sel.incidentId,
      target: { state: sel.state, cityId: sel.cityId, incidentId: sel.incidentId },
      current: true,
    });
  }
  return crumbs;
}

/** Selezione del livello superiore (per "Indietro"/Esc). */
export function parentSelection(sel: Selection): Selection {
  const level = levelOf(sel);
  if (level === 3) return { state: sel.state, cityId: sel.cityId };
  if (level === 2) return { state: sel.state };
  return {};
}

export function selectionKey(sel: Selection): string {
  return `${sel.state ?? ''}|${sel.cityId ?? ''}|${sel.incidentId ?? ''}`;
}
