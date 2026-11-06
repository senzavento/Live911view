import type { Incident } from '@live911/shared';
import { SF_BOUNDS } from '@live911/shared';
import type { Selection } from '../store';
import { AREA_FOCUS_ZOOM, INCIDENT_FOCUS_ZOOM, INTERSECTION_FOCUS_ZOOM } from './levels';

export interface LngLatPoint {
  lat: number;
  lng: number;
}

export type ViewTarget =
  | { kind: 'bounds'; bounds: [[number, number], [number, number]] }
  | { kind: 'center'; center: [number, number]; zoom: number };

export interface SyncContext {
  areaPosition(areaId: string): LngLatPoint | undefined;
  intersectionPosition(intersectionId: string): LngLatPoint | undefined;
  incident(id: string): Incident | undefined;
  currentZoom: number;
}

/** Vista di destinazione per una selezione (più specifico vince); null se non risolvibile. */
export function targetForSelection(sel: Selection, ctx: SyncContext): ViewTarget | null {
  if (sel.incidentId) {
    const inc = ctx.incident(sel.incidentId);
    if (inc) return { kind: 'center', center: [inc.lng, inc.lat], zoom: Math.max(ctx.currentZoom, INCIDENT_FOCUS_ZOOM) };
  }
  if (sel.intersectionId) {
    const p = ctx.intersectionPosition(sel.intersectionId);
    if (p) return { kind: 'center', center: [p.lng, p.lat], zoom: Math.max(ctx.currentZoom, INTERSECTION_FOCUS_ZOOM) };
  }
  if (sel.areaId) {
    const p = ctx.areaPosition(sel.areaId);
    if (p) return { kind: 'center', center: [p.lng, p.lat], zoom: AREA_FOCUS_ZOOM };
  }
  if (!sel.areaId && !sel.intersectionId && !sel.incidentId) return { kind: 'bounds', bounds: SF_BOUNDS };
  return null;
}
