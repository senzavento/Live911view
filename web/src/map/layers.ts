import { INCIDENT_TYPES, TYPE_META } from '@live911/shared';
import type * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import type { MapLevel } from './levels';

export const SRC = {
  states: 'l911-states',
  cities: 'l911-cities',
  incidents: 'l911-incidents',
  pulses: 'l911-pulses',
  selected: 'l911-selected',
} as const;

export const LAYER = {
  stateGlow: 'l911-state-glow',
  stateCore: 'l911-state-core',
  stateLabel: 'l911-state-label',
  cityGlow: 'l911-city-glow',
  cityCore: 'l911-city-core',
  cityLabel: 'l911-city-label',
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
  state: [LAYER.stateGlow, LAYER.stateCore, LAYER.stateLabel],
  city: [LAYER.cityGlow, LAYER.cityCore, LAYER.cityLabel],
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
    6, prio(3.6 * mult, 3 * mult, 2.4 * mult),
    10, prio(7 * mult, 5.4 * mult, 4.4 * mult),
    16, prio(12 * mult, 9.6 * mult, 8 * mult),
  ] as ExpressionSpecification;
}

export function addDataLayers(map: maplibregl.Map, empty: GeoJSON.FeatureCollection): void {
  for (const s of Object.values(SRC)) map.addSource(s, { type: 'geojson', data: empty });

  // ---- livello stati
  map.addLayer({ id: LAYER.stateGlow, type: 'circle', source: SRC.states, paint: {
    'circle-radius': ['*', ['get', 'r'], 1.9], 'circle-color': ['get', 'c'], 'circle-opacity': 0.28, 'circle-blur': 1 } });
  map.addLayer({ id: LAYER.stateCore, type: 'circle', source: SRC.states, paint: {
    'circle-radius': ['get', 'r'], 'circle-color': ['get', 'c'], 'circle-opacity': 0.72,
    'circle-stroke-color': ['case', ['==', ['get', 'sel'], 1], '#ffffff', ['get', 'c2']],
    'circle-stroke-width': ['case', ['==', ['get', 'sel'], 1], 3, 1.5], 'circle-stroke-opacity': 0.95 } });
  map.addLayer({ id: LAYER.stateLabel, type: 'symbol', source: SRC.states, layout: {
    'icon-image': ['concat', 'lbl:', ['get', 'lbl']], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });

  // ---- livello città
  map.addLayer({ id: LAYER.cityGlow, type: 'circle', source: SRC.cities, paint: {
    'circle-radius': ['*', ['get', 'r'], 1.8], 'circle-color': ['get', 'c'], 'circle-opacity': 0.3, 'circle-blur': 1 } });
  map.addLayer({ id: LAYER.cityCore, type: 'circle', source: SRC.cities, paint: {
    'circle-radius': ['get', 'r'], 'circle-color': ['get', 'c'], 'circle-opacity': 0.75,
    'circle-stroke-color': ['case', ['==', ['get', 'sel'], 1], '#ffffff', ['get', 'c2']],
    'circle-stroke-width': ['case', ['==', ['get', 'sel'], 1] , 3, 2.5], 'circle-stroke-opacity': 0.95 } });
  map.addLayer({ id: LAYER.cityLabel, type: 'symbol', source: SRC.cities, layout: {
    'icon-image': ['concat', 'lbl:', ['get', 'lbl']], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });

  // ---- singoli incidenti: halo multi-layer sfocato + nucleo + punto caldo
  map.addLayer({ id: LAYER.incGlowOuter, type: 'circle', source: SRC.incidents, paint: {
    'circle-radius': incRadius(4.2), 'circle-color': typeColor(), 'circle-opacity': 0.34, 'circle-blur': 1 } });
  map.addLayer({ id: LAYER.incGlowMid, type: 'circle', source: SRC.incidents, paint: {
    'circle-radius': incRadius(2.3), 'circle-color': typeColor(), 'circle-opacity': 0.6, 'circle-blur': 0.9 } });
  map.addLayer({ id: LAYER.incCritical, type: 'circle', source: SRC.incidents, filter: ['==', ['get', 'p'], 1], paint: {
    'circle-radius': 12, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': typeColor(),
    'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.6, 'circle-blur': 0.15 } });
  map.addLayer({ id: LAYER.incCore, type: 'circle', source: SRC.incidents, paint: {
    'circle-radius': incRadius(1), 'circle-color': typeColor(), 'circle-opacity': 1,
    'circle-stroke-color': '#ffffff', 'circle-stroke-opacity': ['case', ['==', ['get', 'st'], 1], 0.9, 0.35],
    'circle-stroke-width': 0.8, 'circle-blur': 0.1 } });
  map.addLayer({ id: LAYER.incHot, type: 'circle', source: SRC.incidents, paint: {
    'circle-radius': incRadius(0.42), 'circle-color': '#ffffff', 'circle-opacity': 0.85, 'circle-blur': 0.3 } });

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
