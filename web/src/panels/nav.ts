import type { Selection } from '../store';

export const CITY_NAME = 'San Francisco';

export type Level = 0 | 1 | 2 | 3;

export interface Crumb {
  label: string;
  /** Selezione da applicare al click. */
  target: Selection;
  current: boolean;
}

/** Livelli superiori noti di una chiamata (da store o da API). */
export interface Parents {
  areaId?: string;
  intersectionId?: string;
}
export type IncidentLookup = (incidentId: string) => Parents | undefined;

/**
 * Completa una selezione parziale (es. solo incidentId) ricavando i livelli superiori dalla
 * chiamata nota. Restituisce solo chiavi definite.
 */
export function normalizeSelection(sel: Selection, lookup?: IncidentLookup): Selection {
  let { areaId, intersectionId } = sel;
  const { incidentId } = sel;
  if (incidentId) {
    const p = lookup?.(incidentId);
    areaId = areaId ?? p?.areaId;
    intersectionId = intersectionId ?? p?.intersectionId;
  }
  const out: Selection = {};
  if (areaId) out.areaId = areaId;
  if (intersectionId) out.intersectionId = intersectionId;
  if (incidentId) out.incidentId = incidentId;
  return out;
}

export function levelOf(sel: Selection): Level {
  if (sel.incidentId) return 3;
  if (sel.intersectionId) return 2;
  if (sel.areaId) return 1;
  return 0;
}

export interface CrumbNames {
  area?: string;
  intersection?: string;
  incident?: string;
}

/** Breadcrumb "San Francisco › Quartiere › Incrocio › Chiamata" da una selezione normalizzata. */
export function buildCrumbs(sel: Selection, names: CrumbNames = {}): Crumb[] {
  const level = levelOf(sel);
  const crumbs: Crumb[] = [{ label: CITY_NAME, target: {}, current: level === 0 }];
  if (sel.areaId) {
    crumbs.push({ label: names.area ?? sel.areaId, target: { areaId: sel.areaId }, current: level === 1 });
  }
  if (sel.intersectionId) {
    const target: Selection = sel.areaId ? { areaId: sel.areaId, intersectionId: sel.intersectionId } : { intersectionId: sel.intersectionId };
    crumbs.push({ label: names.intersection ?? sel.intersectionId, target, current: level === 2 });
  }
  if (sel.incidentId) {
    crumbs.push({ label: names.incident ?? sel.incidentId, target: { ...sel }, current: true });
  }
  return crumbs;
}

/** Selezione del livello superiore (per "Indietro"/Esc). */
export function parentSelection(sel: Selection): Selection {
  const level = levelOf(sel);
  const out: Selection = {};
  if (level === 3) {
    if (sel.areaId) out.areaId = sel.areaId;
    if (sel.intersectionId) out.intersectionId = sel.intersectionId;
  } else if (level === 2 && sel.areaId) {
    out.areaId = sel.areaId;
  }
  return out;
}

export function selectionKey(sel: Selection): string {
  return `${sel.areaId ?? ''}|${sel.intersectionId ?? ''}|${sel.incidentId ?? ''}`;
}

export function backLabel(level: Level, hasArea: boolean): string {
  if (level === 3) return '← Incrocio';
  if (level === 2) return hasArea ? '← Quartiere' : `← ${CITY_NAME}`;
  return `← ${CITY_NAME}`;
}
