import type { Selection } from '../store';

export type MapLevel = 'state' | 'city' | 'incident';

/** Sotto questa soglia: aggregati per stato. */
export const STATE_MAX_ZOOM = 4.5;
/** Da questa soglia in su: singoli incidenti. */
export const INCIDENT_MIN_ZOOM = 8;
/** Con una città selezionata i singoli incidenti compaiono già da qui. */
export const CITY_SELECTED_MIN_ZOOM = 6;

export const CITY_FOCUS_ZOOM = 10.5;
export const INCIDENT_FOCUS_ZOOM = 14;

/** Livello di aggregazione mostrato in base a zoom e selezione. */
export function levelForZoom(zoom: number, sel: Selection = {}): MapLevel {
  if (zoom >= INCIDENT_MIN_ZOOM) return 'incident';
  if ((sel.cityId || sel.incidentId) && zoom >= CITY_SELECTED_MIN_ZOOM) return 'incident';
  if (zoom >= STATE_MAX_ZOOM) return 'city';
  return 'state';
}

export type ViewLabel = 'Nazionale' | 'Stato' | 'Città' | 'Incidente';

/** Etichetta accessibile dell'indicatore di livello. */
export function describeView(level: MapLevel, sel: Selection = {}): ViewLabel {
  if (sel.incidentId) return 'Incidente';
  if (level === 'incident') return sel.cityId ? 'Città' : 'Incidente';
  if (level === 'city') return 'Stato';
  return 'Nazionale';
}
