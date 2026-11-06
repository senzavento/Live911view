import { INCIDENT_TYPES, TYPE_META } from '@live911/shared';
import type * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import type { MapLevel } from './levels';

export const SRC = {
  areas: 'l911-areas',
  intersections: 'l911-intersections',
  incidents: 'l911-incidents',
  pulses: 'l911-pulses',
  selected: 'l911-selected',
} as const;

export const LAYER = {
  areaGlow: 'l911-area-glow',
  areaCore: 'l911-area-core',
  areaLabel: 'l911-area-label',
  xGlow: 'l911-x-glow',
  xCore: 'l911-x-core',
  xLabel: 'l911-x-label',
  incGlowOuter: 'l911-inc-glow-outer',
  incGlowMid: 'l911-inc-glow-mid',
  incCritical: 'l911-inc-critical',
  incCore: 'l911-inc-core',
  incHot: 'l911-inc-hot',
  selected: 'l911-selected-ring',
  pulseRing: 'l911-pulse-ring',
  pulseFade: 'l911-pulse-fade',
} as const;

export const LEVEL_LAYERS: Record<MapLevel, string[]> = {
  area: [LAYER.areaGlow, LAYER.areaCore, LAYER.areaLabel],
  intersection: [LAYER.xGlow, LAYER.xCore, LAYER.xLabel],
  incident: [LAYER.incGlowOuter, LAYER.incGlowMid, LAYER.incCritical, LAYER.incCore, LAYER.incHot, LAYER.pulseRing, LAYER.pulseFade],
};

export const BG_COLOR = '#0a0f18';

/** Solid dark background only: the raster basemap is optional and added at runtime (see basemap.ts). */
export function baseStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': BG_COLOR } }],
  };
}

const typeColor = (): ExpressionSpecification => {
  const m: unknown[] = ['match', ['get', 't']];
  for (const t of INCIDENT_TYPES) m.push(t, TYPE_META[t].color);
  m.push('#ffffff');
  return m as ExpressionSpecification;
};

/** Moltiplicatore per priorità (1 critica, 2 alta, 3 normale). */
const prio = (crit: number, high: number, norm: number): ExpressionSpecification => ['match', ['get', 'p'], 1, crit, 2, high, norm];

/** Raggio base (px) a due stop di zoom, scalato per priorità. */
function incRadius(mult: number): ExpressionSpecification {
  return [
    'interpolate', ['linear'], ['zoom'],
    12, prio(4 * mult, 3.2 * mult, 2.6 * mult),
    15, prio(6.5 * mult, 5 * mult, 4 * mult),
    18, prio(11 * mult, 8.6 * mult, 7 * mult),
  ] as ExpressionSpecification;
}

export function addDataLayers(map: maplibregl.Map, empty: GeoJSON.FeatureCollection): void {
  for (const s of Object.values(SRC)) map.addSource(s, { type: 'geojson', data: empty });

  // ---- quartieri
  map.addLayer({ id: LAYER.areaGlow, type: 'circle', source: SRC.areas, paint: {
    'circle-radius': ['*', ['get', 'r'], 1.9], 'circle-color': ['get', 'c'], 'circle-opacity': 0.28, 'circle-blur': 1 } });
  map.addLayer({ id: LAYER.areaCore, type: 'circle', source: SRC.areas, paint: {
    'circle-radius': ['get', 'r'], 'circle-color': ['get', 'c'], 'circle-opacity': 0.72,
    'circle-stroke-color': ['case', ['==', ['get', 'sel'], 1], '#ffffff', ['get', 'c2']],
    'circle-stroke-width': ['case', ['==', ['get', 'sel'], 1], 3, 1.5], 'circle-stroke-opacity': 0.95 } });
  map.addLayer({ id: LAYER.areaLabel, type: 'symbol', source: SRC.areas, layout: {
    'icon-image': ['concat', 'lbl:', ['get', 'lbl']], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });

  // ---- incroci
  map.addLayer({ id: LAYER.xGlow, type: 'circle', source: SRC.intersections, paint: {
    'circle-radius': ['*', ['get', 'r'], 1.8], 'circle-color': ['get', 'c'], 'circle-opacity': 0.3, 'circle-blur': 1 } });
  map.addLayer({ id: LAYER.xCore, type: 'circle', source: SRC.intersections, paint: {
    'circle-radius': ['get', 'r'], 'circle-color': ['get', 'c'], 'circle-opacity': 0.75,
    'circle-stroke-color': ['case', ['==', ['get', 'sel'], 1], '#ffffff', ['get', 'c2']],
    'circle-stroke-width': ['case', ['==', ['get', 'sel'], 1], 3, 2], 'circle-stroke-opacity': 0.95 } });
  map.addLayer({ id: LAYER.xLabel, type: 'symbol', source: SRC.intersections, layout: {
    'icon-image': ['concat', 'lbl:', ['get', 'lbl']], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });

  // ---- singoli incidenti: halo multi-layer sfocato + nucleo + punto caldo
  map.addLayer({ id: LAYER.incGlowOuter, type: 'circle', source: SRC.incidents, paint: {
    'circle-radius': incRadius(4.2), 'circle-color': typeColor(), 'circle-opacity': ['*', 0.34, ['get', 'd']], 'circle-blur': 1 } });
  map.addLayer({ id: LAYER.incGlowMid, type: 'circle', source: SRC.incidents, paint: {
    'circle-radius': incRadius(2.3), 'circle-color': typeColor(), 'circle-opacity': ['*', 0.6, ['get', 'd']], 'circle-blur': 0.9 } });
  map.addLayer({ id: LAYER.incCritical, type: 'circle', source: SRC.incidents, filter: ['==', ['get', 'p'], 1], paint: {
    'circle-radius': 12, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': typeColor(),
    'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.6, 'circle-blur': 0.15 } });
  map.addLayer({ id: LAYER.incCore, type: 'circle', source: SRC.incidents, paint: {
    'circle-radius': incRadius(1), 'circle-color': typeColor(), 'circle-opacity': ['*', 1, ['get', 'd']],
    'circle-stroke-color': '#ffffff', 'circle-stroke-opacity': ['case', ['==', ['get', 'st'], 1], 0.9, 0.35],
    'circle-stroke-width': 0.8, 'circle-blur': 0.1 } });
  map.addLayer({ id: LAYER.incHot, type: 'circle', source: SRC.incidents, paint: {
    'circle-radius': incRadius(0.42), 'circle-color': '#ffffff', 'circle-opacity': ['*', 0.85, ['get', 'd']], 'circle-blur': 0.3 } });

  // ---- selezione (incidente) e pulse effimeri
  map.addLayer({ id: LAYER.selected, type: 'circle', source: SRC.selected, paint: {
    'circle-radius': 16, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.95 } });
  map.addLayer({ id: LAYER.pulseRing, type: 'circle', source: SRC.pulses, filter: ['==', ['get', 'k'], 0], paint: {
    'circle-radius': ['get', 'r'], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': ['get', 'c'],
    'circle-stroke-width': ['get', 'w'], 'circle-stroke-opacity': ['get', 'o'] } });
  map.addLayer({ id: LAYER.pulseFade, type: 'circle', source: SRC.pulses, filter: ['==', ['get', 'k'], 1], paint: {
    'circle-radius': ['get', 'r'], 'circle-color': ['get', 'c'], 'circle-opacity': ['get', 'o'], 'circle-blur': 0.6 } });
}

export function setLevelVisibility(map: maplibregl.Map, level: MapLevel): void {
  for (const [lvl, ids] of Object.entries(LEVEL_LAYERS) as [MapLevel, string[]][]) {
    const v = lvl === level ? 'visible' : 'none';
    for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v);
  }
  if (map.getLayer(LAYER.selected)) map.setLayoutProperty(LAYER.selected, 'visibility', level === 'incident' ? 'visible' : 'none');
}
