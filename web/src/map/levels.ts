import type { Selection } from '../store';

/** area = bolle per quartiere (vista città), intersection = bolle per incrocio, incident = singole chiamate. */
export type MapLevel = 'area' | 'intersection' | 'incident';

/** Sotto questa soglia: aggregati per quartiere. */
export const AREA_MAX_ZOOM = 12.5;
/** Da questa soglia in su: singole chiamate. */
export const INCIDENT_MIN_ZOOM = 15;

export const AREA_FOCUS_ZOOM = 13.3;
export const INTERSECTION_FOCUS_ZOOM = 16;
export const INCIDENT_FOCUS_ZOOM = 16.5;

/** Livello mostrato in base a zoom e selezione (un incrocio selezionato mostra le chiamate già da 12.5). */
export function levelForZoom(zoom: number, sel: Selection = {}): MapLevel {
  if (zoom >= INCIDENT_MIN_ZOOM) return 'incident';
  if (zoom >= AREA_MAX_ZOOM) return sel.intersectionId || sel.incidentId ? 'incident' : 'intersection';
  return 'area';
}

export type ViewLabel = 'Città' | 'Quartiere' | 'Incrocio' | 'Chiamata';

/** Etichetta accessibile dell'indicatore di livello. */
export function describeView(level: MapLevel, sel: Selection = {}): ViewLabel {
  if (sel.incidentId) return 'Chiamata';
  if (sel.intersectionId) return 'Incrocio';
  if (level === 'incident') return 'Chiamata';
  if (level === 'intersection') return 'Quartiere';
  return sel.areaId ? 'Quartiere' : 'Città';
}
