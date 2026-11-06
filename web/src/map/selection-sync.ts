import type { Incident } from '@live911/shared';
import type { Selection } from '../store';
import { STATE_GEO_BY_CODE, US_BOUNDS } from './geo-data';
import type { LngLatPoint } from './geo-data';
import { CITY_FOCUS_ZOOM, INCIDENT_FOCUS_ZOOM } from './levels';

export type ViewTarget =
  | { kind: 'bounds'; bounds: [[number, number], [number, number]] }
  | { kind: 'center'; center: [number, number]; zoom: number };

export interface SyncContext {
  cityPosition(cityId: string): LngLatPoint | undefined;
  incident(id: string): Incident | undefined;
}

/** Vista di destinazione per una selezione (più specifico vince); null se non risolvibile. */
export function targetForSelection(sel: Selection, ctx: SyncContext): ViewTarget | null {
  if (sel.incidentId) {
    const inc = ctx.incident(sel.incidentId);
    if (inc) return { kind: 'center', center: [inc.lng, inc.lat], zoom: INCIDENT_FOCUS_ZOOM };
  }
  if (sel.cityId) {
    const c = ctx.cityPosition(sel.cityId);
    if (c) return { kind: 'center', center: [c.lng, c.lat], zoom: CITY_FOCUS_ZOOM };
  }
  if (sel.state) {
    const s = STATE_GEO_BY_CODE.get(sel.state);
    if (s) return { kind: 'center', center: [s.lng, s.lat], zoom: s.zoom };
  }
  if (!sel.state && !sel.cityId && !sel.incidentId) return { kind: 'bounds', bounds: US_BOUNDS };
  return null;
}
