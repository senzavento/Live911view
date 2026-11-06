import * as maplibregl from 'maplibre-gl';
// maplibre-gl 6 does not bundle its worker: Vite must emit it as an asset and hand us the URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { TYPE_META, PRIORITY_LABEL } from '@live911/shared';
import type { City, Incident } from '@live911/shared';
import type { Store, StoreEvent } from '../store';
import { Aggregator } from './aggregate';
import { ensureLabelImage } from './labels';
import { LevelBadge, ResetControl, injectStyle } from './controls';
import { cityFeatures, collection, incidentFeature, pulseFeatures, stateFeatures } from './features';
import type { PointFeature } from './features';
import { STATE_GEO_BY_CODE, US_BOUNDS } from './geo-data';
import type { LngLatPoint } from './geo-data';
import { BG_COLOR, LAYER, SRC, addDataLayers, baseStyle, setLevelVisibility } from './layers';
import { describeView, levelForZoom } from './levels';
import type { MapLevel } from './levels';
import { PulseSet } from './pulses';
import { targetForSelection } from './selection-sync';

export { levelForZoom, describeView } from './levels';
export type { MapLevel } from './levels';

export interface MountMapOptions {
  /** Sorgente del catalogo città (default: GET /api/cities). */
  loadCities?: () => Promise<City[]>;
}

const DATA_FLUSH_MS = 150;
const CRITICAL_PAINT_MS = 70;

const defaultLoadCities = async (): Promise<City[]> => {
  const res = await fetch('/api/cities');
  if (!res.ok) throw new Error(`cities ${res.status}`);
  return (await res.json()) as City[];
};

type GeoSource = maplibregl.GeoJSONSource;

export function mountMap(el: HTMLElement, store: Store, opts: MountMapOptions = {}): () => void {
  const removeStyle = injectStyle();
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
  let reducedMotion = reduced?.matches ?? false;
  const onReducedChange = (e: MediaQueryListEvent): void => {
    reducedMotion = e.matches;
    pulses.clear();
    wake();
  };
  reduced?.addEventListener('change', onReducedChange);

  maplibregl.setWorkerUrl(workerUrl);
  const map = new maplibregl.Map({
    container: el,
    style: baseStyle(),
    bounds: US_BOUNDS,
    fitBoundsOptions: { padding: 24 },
    minZoom: 2,
    maxZoom: 18,
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
  });
  map.touchZoomRotate.disableRotation();
  map.getCanvas().style.background = BG_COLOR;
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new ResetControl(() => resetView()), 'top-right');
  const badge = new LevelBadge(el);

  const agg = new Aggregator();
  const pulses = new PulseSet();
  const incFeatures = new Map<string, PointFeature>();
  const cities = new Map<string, City>();
  let level: MapLevel = 'state';
  let ready = false;
  let destroyed = false;
  let raf = 0;
  let lastFlush = 0;
  let lastCritical = 0;
  let incDirty = true;
  let aggDirty = true;
  let selDirty = true;
  let popup: maplibregl.Popup | null = null;
  let popupFor = '';

  const cityPos = (id: string): LngLatPoint | undefined => {
    const c = cities.get(id);
    if (c) return c;
    const b = agg.cities.get(id);
    return b && b.active > 0 ? { lat: b.sumLat / b.active, lng: b.sumLng / b.active } : undefined;
  };
  const src = (id: string): GeoSource | undefined => map.getSource(id) as GeoSource | undefined;

  // ---------- rendering throttled (rAF) ----------
  const wake = (): void => {
    if (!raf && !destroyed && !document.hidden) raf = requestAnimationFrame(frame);
  };

  function frame(now: number): void {
    raf = 0;
    if (destroyed || !ready) return;
    let more = false;

    if ((aggDirty || selDirty || incDirty) && now - lastFlush >= DATA_FLUSH_MS) {
      flushData();
      lastFlush = now;
    } else if (aggDirty || selDirty || incDirty) more = true;

    if (level === 'incident' && !reducedMotion) {
      if (pulses.size > 0) {
        src(SRC.pulses)?.setData(collection(pulseFeatures(pulses.frames(now))));
        more = true;
        if (pulses.size === 0) src(SRC.pulses)?.setData(collection([]));
      }
      if (now - lastCritical >= CRITICAL_PAINT_MS) {
        lastCritical = now;
        const ph = (now % 1800) / 1800;
        map.setPaintProperty(LAYER.incCritical, 'circle-radius', 7 + 12 * ph);
        map.setPaintProperty(LAYER.incCritical, 'circle-stroke-opacity', 0.75 * (1 - ph));
      }
      more = true;
    } else if (pulses.size > 0) {
      pulses.clear();
      src(SRC.pulses)?.setData(collection([]));
    }
    if (more) wake();
  }

  function flushData(): void {
    const sel = store.selection;
    if (aggDirty || selDirty) {
      const sf = stateFeatures(agg, sel.state);
      const cf = cityFeatures(agg, cityPos, sel.cityId);
      for (const f of sf) ensureLabelImage(map, String(f.properties['lbl']));
      for (const f of cf) ensureLabelImage(map, String(f.properties['lbl']));
      src(SRC.states)?.setData(collection(sf));
      src(SRC.cities)?.setData(collection(cf));
      aggDirty = false;
      agg.dirtyStates.clear();
      agg.dirtyCities.clear();
    }
    if (incDirty && level === 'incident') {
      src(SRC.incidents)?.setData(collection([...incFeatures.values()]));
      incDirty = false;
    }
    if (selDirty) {
      const inc = sel.incidentId ? store.incidents.get(sel.incidentId) : undefined;
      src(SRC.selected)?.setData(collection(inc ? [incidentFeature(inc)] : []));
      selDirty = false;
    }
  }

  // ---------- livello in base a zoom/selezione ----------
  function updateLevel(): void {
    const next = levelForZoom(map.getZoom(), store.selection);
    if (next !== level) {
      level = next;
      if (ready) setLevelVisibility(map, level);
      if (level === 'incident') incDirty = true;
      wake();
    }
    const sel = store.selection;
    const city = sel.cityId ? (cities.get(sel.cityId)?.name ?? sel.cityId) : '';
    const label = describeView(level, sel);
    const detail = label === 'Incidente' && sel.incidentId ? sel.incidentId : label === 'Città' ? city : sel.state ?? '';
    badge.set(label, label === 'Nazionale' ? '' : detail);
  }

  // ---------- store -> mappa ----------
  function onStoreEvent(e: StoreEvent): void {
    switch (e.kind) {
      case 'snapshot':
        agg.rebuild(store.incidents.values());
        incFeatures.clear();
        for (const i of store.incidents.values()) incFeatures.set(i.id, incidentFeature(i));
        pulses.clear();
        aggDirty = incDirty = selDirty = true;
        break;
      case 'incident': {
        const i = e.incident;
        agg.apply(e.op, i);
        aggDirty = true;
        if (e.op === 'resolved') {
          incFeatures.delete(i.id);
          spawnPulse('fade', i);
        } else {
          incFeatures.set(i.id, incidentFeature(i));
          if (e.op === 'created') spawnPulse('birth', i);
        }
        incDirty = true;
        if (store.selection.incidentId === i.id) {
          selDirty = true;
          syncPopup();
        }
        break;
      }
      case 'selection':
        selDirty = true;
        aggDirty = true;
        applySelection();
        break;
      default:
        return;
    }
    wake();
  }

  function spawnPulse(kind: 'birth' | 'fade', i: Incident): void {
    if (reducedMotion || document.hidden || level !== 'incident') return;
    pulses.add({ kind, lng: i.lng, lat: i.lat, color: TYPE_META[i.type].color, critical: i.priority === 1, start: performance.now() });
  }

  function applySelection(): void {
    const target = targetForSelection(store.selection, { cityPosition: cityPos, incident: (id) => store.incidents.get(id) });
    if (target) {
      const dur = reducedMotion ? 0 : 1400;
      if (target.kind === 'bounds') map.fitBounds(target.bounds, { padding: 24, duration: dur });
      else map.flyTo({ center: target.center, zoom: target.zoom, duration: dur, essential: false });
    }
    updateLevel();
    syncPopup();
  }

  function resetView(): void {
    store.clearSelection();
    map.fitBounds(US_BOUNDS, { padding: 24, duration: reducedMotion ? 0 : 1000 });
  }

  // ---------- popup incidente ----------
  function syncPopup(): void {
    const id = store.selection.incidentId;
    const inc = id ? store.incidents.get(id) : undefined;
    if (!inc) {
      popupFor = '';
      popup?.remove();
      popup = null;
      return;
    }
    if (popupFor !== inc.id) {
      popupFor = '';
      popup?.remove();
      const created = new maplibregl.Popup({ className: 'l911-popup', offset: 14, closeButton: true, closeOnClick: false, maxWidth: '260px' });
      popup = created;
      created.on('close', () => {
        if (popupFor === inc.id && store.selection.incidentId === inc.id) {
          const { state, cityId } = store.selection;
          store.select({ state, cityId });
        }
      });
      created.addTo(map);
      popupFor = inc.id;
    }
    const box = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = `${TYPE_META[inc.type].icon} ${TYPE_META[inc.type].label}`;
    title.style.color = TYPE_META[inc.type].color;
    const addr = document.createElement('div');
    addr.textContent = inc.address;
    const meta = document.createElement('span');
    meta.textContent = `Priorità ${PRIORITY_LABEL[inc.priority]} · ${inc.unitsAssigned} unità`;
    box.append(title, addr, meta);
    popup?.setLngLat([inc.lng, inc.lat]).setDOMContent(box);
  }

  // ---------- interazione ----------
  const hit = (e: maplibregl.MapMouseEvent, layer: string) => map.queryRenderedFeatures(e.point, { layers: [layer] })[0];
  const onClick = (e: maplibregl.MapMouseEvent): void => {
    if (!ready) return;
    if (level === 'incident') {
      const f = hit(e, LAYER.incGlowMid);
      const id = f?.properties?.['id'] as string | undefined;
      const inc = id ? store.incidents.get(id) : undefined;
      if (inc) store.select({ state: inc.state, cityId: inc.cityId, incidentId: inc.id });
    } else if (level === 'city') {
      const f = hit(e, LAYER.cityCore);
      const cityId = f?.properties?.['cityId'] as string | undefined;
      const state = f?.properties?.['state'] as string | undefined;
      if (cityId && state) store.select({ state, cityId });
    } else {
      const f = hit(e, LAYER.stateCore);
      const code = f?.properties?.['code'] as string | undefined;
      if (code && STATE_GEO_BY_CODE.has(code)) store.select({ state: code });
    }
  };
  const onMove = (e: maplibregl.MapMouseEvent): void => {
    if (!ready) return;
    const layer = level === 'incident' ? LAYER.incGlowMid : level === 'city' ? LAYER.cityCore : LAYER.stateCore;
    map.getCanvas().style.cursor = map.queryRenderedFeatures(e.point, { layers: [layer] }).length ? 'pointer' : '';
  };
  const onVisibility = (): void => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      pulses.clear();
    } else {
      aggDirty = incDirty = true;
      wake();
    }
  };

  map.on('click', onClick);
  map.on('mousemove', onMove);
  map.on('zoom', updateLevel);
  map.on('error', () => {
    /* tile/risorse non raggiungibili: la mappa resta usabile su sfondo scuro */
  });
  document.addEventListener('visibilitychange', onVisibility);
  const unsub = store.subscribe(onStoreEvent);

  map.on('load', () => {
    if (destroyed) return;
    addDataLayers(map, collection([]));
    ready = true;
    level = levelForZoom(map.getZoom(), store.selection);
    setLevelVisibility(map, level);
    if (store.incidents.size) onStoreEvent({ kind: 'snapshot' });
    aggDirty = incDirty = selDirty = true;
    updateLevel();
    wake();
  });
  updateLevel();

  // catalogo città: opzionale, il fallback usa le medie delle coordinate
  (opts.loadCities ?? defaultLoadCities)()
    .then((list) => {
      if (destroyed) return;
      for (const c of list) cities.set(c.id, c);
      aggDirty = true;
      wake();
    })
    .catch(() => {
      /* città non ancora disponibili: si usano i centroidi derivati dagli incidenti */
    });

  return () => {
    destroyed = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    unsub();
    document.removeEventListener('visibilitychange', onVisibility);
    reduced?.removeEventListener('change', onReducedChange);
    map.off('click', onClick);
    map.off('mousemove', onMove);
    map.off('zoom', updateLevel);
    popupFor = '';
    popup?.remove();
    badge.destroy();
    map.remove();
    removeStyle();
  };
}
