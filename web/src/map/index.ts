import * as maplibregl from 'maplibre-gl';
// maplibre-gl 6 does not bundle its worker: Vite must emit it as an asset and hand us the URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { PRIORITY_LABEL, SF_BOUNDS, TYPE_META } from '@live911/shared';
import type { AreaInfo, Incident, IncidentStatus } from '@live911/shared';
import type { Store, StoreEvent } from '../store';
import { Aggregator, bucketCentroid } from './aggregate';
import { ensureLabelImage } from './labels';
import { LevelBadge, ResetControl, injectStyle } from './controls';
import { areaFeatures, collection, incidentFeature, intersectionFeatures, pulseFeatures } from './features';
import type { PointFeature } from './features';
import { addBasemap, fetchBasemap } from './basemap';
import { BG_COLOR, LAYER, SRC, addDataLayers, baseStyle, setLevelVisibility } from './layers';
import { describeView, levelForZoom } from './levels';
import type { MapLevel } from './levels';
import { PulseSet } from './pulses';
import { targetForSelection } from './selection-sync';
import type { LngLatPoint } from './selection-sync';

export { levelForZoom, describeView } from './levels';
export type { MapLevel } from './levels';

export interface MountMapOptions {
  /** Sorgente del catalogo quartieri (default: GET /api/areas). */
  loadAreas?: () => Promise<AreaInfo[]>;
}

const DATA_FLUSH_MS = 150;
const CRITICAL_PAINT_MS = 70;
const MIN_ZOOM = 10.5;
const MAX_ZOOM = 18;
/** Un po' più largo di SF_BOUNDS: si può spostare la vista, ma non perdersi. */
const MAX_BOUNDS: [[number, number], [number, number]] = [
  [SF_BOUNDS[0][0] - 0.1, SF_BOUNDS[0][1] - 0.08],
  [SF_BOUNDS[1][0] + 0.1, SF_BOUNDS[1][1] + 0.08],
];

const STATUS_LABEL: Record<IncidentStatus, string> = { dispatched: 'Inviata', on_scene: 'Sul posto', resolved: 'Chiusa', expired: 'Scaduta' };

const defaultLoadAreas = async (): Promise<AreaInfo[]> => {
  const res = await fetch('/api/areas');
  if (!res.ok) throw new Error(`areas ${res.status}`);
  return (await res.json()) as AreaInfo[];
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
    bounds: SF_BOUNDS,
    fitBoundsOptions: { padding: 24 },
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    maxBounds: MAX_BOUNDS,
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
  const areas = new Map<string, AreaInfo>();
  let level: MapLevel = 'area';
  let ready = false;
  let destroyed = false;
  let raf = 0;
  let lastFlush = 0;
  let lastCritical = 0;
  // un flag per livello: si ricostruisce solo ciò che è visibile, il resto resta "sporco"
  let areaDirty = true;
  let xDirty = true;
  let incDirty = true;
  let selDirty = true;
  let skipFly = false;
  let popup: maplibregl.Popup | null = null;
  let popupFor = '';
  let tip: maplibregl.Popup | null = null;
  let tipFor = '';

  const areaPos = (id: string): LngLatPoint | undefined => {
    const a = areas.get(id);
    if (a) return a;
    const b = agg.areas.get(id);
    return b && b.active > 0 ? bucketCentroid(b) : undefined;
  };
  const xPos = (id: string): LngLatPoint | undefined => {
    const b = agg.intersections.get(id);
    return b && b.active > 0 ? bucketCentroid(b) : undefined;
  };
  const src = (id: string): GeoSource | undefined => map.getSource(id) as GeoSource | undefined;
  const markAllDirty = (): void => {
    areaDirty = xDirty = incDirty = selDirty = true;
  };

  // ---------- rendering throttled (rAF) ----------
  const wake = (): void => {
    if (!raf && !destroyed && !document.hidden) raf = requestAnimationFrame(frame);
  };

  const visibleDirty = (): boolean =>
    selDirty || (level === 'area' && areaDirty) || (level === 'intersection' && xDirty) || (level === 'incident' && incDirty);

  function frame(now: number): void {
    raf = 0;
    if (destroyed || !ready) return;
    let more = false;

    if (visibleDirty()) {
      if (now - lastFlush >= DATA_FLUSH_MS) {
        flushData();
        lastFlush = now;
      } else more = true;
    }

    if (level === 'incident' && !reducedMotion) {
      if (pulses.size > 0) {
        src(SRC.pulses)?.setData(collection(pulseFeatures(pulses.frames(now))));
        more = true;
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
    if (level === 'area' && areaDirty) {
      const f = areaFeatures(agg, areaPos, sel.areaId);
      for (const x of f) ensureLabelImage(map, String(x.properties['lbl']));
      src(SRC.areas)?.setData(collection(f));
      areaDirty = false;
    }
    if (level === 'intersection' && xDirty) {
      const f = intersectionFeatures(agg, sel.intersectionId);
      for (const x of f) ensureLabelImage(map, String(x.properties['lbl']));
      src(SRC.intersections)?.setData(collection(f));
      xDirty = false;
    }
    if (level === 'incident' && incDirty) {
      src(SRC.incidents)?.setData(collection([...incFeatures.values()]));
      incDirty = false;
    }
    if (selDirty) {
      const f = sel.incidentId ? incFeatures.get(sel.incidentId) : undefined;
      src(SRC.selected)?.setData(collection(f ? [f] : []));
      selDirty = false;
    }
  }

  // ---------- livello in base a zoom/selezione ----------
  function updateLevel(): void {
    const next = levelForZoom(map.getZoom(), store.selection);
    if (next !== level) {
      level = next;
      if (ready) setLevelVisibility(map, level);
      hideTip();
      wake();
    }
    const sel = store.selection;
    const label = describeView(level, sel);
    let detail = '';
    if (label === 'Chiamata' && sel.incidentId) detail = sel.incidentId;
    else if (sel.intersectionId) detail = agg.intersections.get(sel.intersectionId)?.name ?? sel.intersectionId;
    else if (sel.areaId) detail = areas.get(sel.areaId)?.name ?? agg.areas.get(sel.areaId)?.name ?? sel.areaId;
    badge.set(label, detail);
  }

  // ---------- store -> mappa ----------
  function onStoreEvent(e: StoreEvent): void {
    switch (e.kind) {
      case 'snapshot':
        agg.rebuild(store.incidents.values());
        incFeatures.clear();
        for (const i of store.incidents.values()) if (i.status !== 'resolved') incFeatures.set(i.id, incidentFeature(i));
        pulses.clear();
        markAllDirty();
        break;
      case 'incident': {
        const i = e.incident;
        agg.apply(e.op, i);
        areaDirty = xDirty = incDirty = true;
        if (e.op === 'resolved' || i.status === 'resolved') {
          spawnPulse('fade', incFeatures.get(i.id), i);
          incFeatures.delete(i.id);
        } else {
          const f = incidentFeature(i);
          incFeatures.set(i.id, f);
          if (e.op === 'created') spawnPulse('birth', f, i);
        }
        if (store.selection.incidentId === i.id) {
          selDirty = true;
          syncPopup();
        }
        break;
      }
      case 'selection':
        areaDirty = xDirty = selDirty = true;
        applySelection();
        break;
      default:
        return;
    }
    wake();
  }

  function spawnPulse(kind: 'birth' | 'fade', f: PointFeature | undefined, i: Incident): void {
    if (!f || reducedMotion || document.hidden || level !== 'incident') return;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    pulses.add({ kind, lng, lat, color: TYPE_META[i.type].color, critical: i.priority === 1, start: performance.now() });
  }

  function applySelection(): void {
    if (skipFly) {
      skipFly = false;
    } else {
      const target = targetForSelection(store.selection, {
        areaPosition: areaPos,
        intersectionPosition: xPos,
        incident: (id) => store.incidents.get(id),
        currentZoom: map.getZoom(),
      });
      if (target) {
        const dur = reducedMotion ? 0 : 1200;
        if (target.kind === 'bounds') map.fitBounds(target.bounds, { padding: 24, duration: dur });
        else map.flyTo({ center: target.center, zoom: target.zoom, duration: dur, essential: false });
      }
    }
    updateLevel();
    syncPopup();
  }

  function resetView(): void {
    store.clearSelection();
  }

  // ---------- popup chiamata (solo textContent) ----------
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
      const created = new maplibregl.Popup({ className: 'l911-popup', offset: 14, closeButton: true, closeOnClick: false, maxWidth: '270px' });
      popup = created;
      created.on('close', () => {
        if (popupFor === inc.id && store.selection.incidentId === inc.id) {
          const { areaId, intersectionId } = store.selection;
          skipFly = true;
          store.select({ areaId, intersectionId });
        }
      });
      created.addTo(map);
      popupFor = inc.id;
    }
    const meta = TYPE_META[inc.type];
    const box = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = `${meta.icon} ${meta.label}`;
    title.style.color = meta.color;
    const desc = document.createElement('div');
    desc.textContent = inc.description;
    const addr = document.createElement('div');
    addr.textContent = inc.address;
    const info = document.createElement('span');
    info.textContent = `Priorità ${PRIORITY_LABEL[inc.priority]} · ${inc.agency} · ${STATUS_LABEL[inc.status]}`;
    box.append(title, desc, addr, info);
    const f = incFeatures.get(inc.id);
    const pos = (f?.geometry.coordinates as [number, number] | undefined) ?? [inc.lng, inc.lat];
    popup?.setLngLat(pos).setDOMContent(box);
  }

  // ---------- tooltip nome (quartiere / incrocio) ----------
  function hideTip(): void {
    tipFor = '';
    tip?.remove();
    tip = null;
  }
  function showTip(lngLat: maplibregl.LngLat, key: string, name: string, sub: string): void {
    if (tipFor !== key || !tip) {
      hideTip();
      tip = new maplibregl.Popup({ className: 'l911-tip', closeButton: false, closeOnClick: false, offset: 12 }).addTo(map);
      tipFor = key;
    }
    const box = document.createElement('div');
    box.append(document.createTextNode(name));
    if (sub) {
      const s = document.createElement('small');
      s.textContent = sub;
      box.append(s);
    }
    tip.setLngLat(lngLat).setDOMContent(box);
  }

  // ---------- interazione ----------
  const coreLayer = (): string => (level === 'incident' ? LAYER.incGlowMid : level === 'intersection' ? LAYER.xCore : LAYER.areaCore);
  const hit = (point: maplibregl.PointLike): maplibregl.MapGeoJSONFeature | undefined =>
    map.queryRenderedFeatures(point, { layers: [coreLayer()] })[0];
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

  const onClick = (e: maplibregl.MapMouseEvent): void => {
    if (!ready) return;
    const p = hit(e.point)?.properties;
    if (!p) return;
    if (level === 'incident') {
      const inc = store.incidents.get(str(p['id']) ?? '');
      if (inc) store.select({ areaId: inc.areaId, intersectionId: inc.intersectionId, incidentId: inc.id });
    } else if (level === 'intersection') {
      const intersectionId = str(p['intersectionId']);
      const areaId = str(p['areaId']);
      if (intersectionId && areaId) store.select({ areaId, intersectionId });
    } else {
      const areaId = str(p['areaId']);
      if (areaId) store.select({ areaId });
    }
  };
  const onMove = (e: maplibregl.MapMouseEvent): void => {
    if (!ready) return;
    const f = hit(e.point);
    map.getCanvas().style.cursor = f ? 'pointer' : '';
    const p = f?.properties;
    if (!p || level === 'incident') return hideTip();
    if (level === 'area') showTip(e.lngLat, `a:${p['areaId']}`, String(p['name'] ?? ''), `${p['n']} attive`);
    else showTip(e.lngLat, `x:${p['intersectionId']}`, String(p['name'] ?? ''), `${p['area'] ?? ''} · ${p['n']} attive`);
  };
  const onLeave = (): void => hideTip();
  const onVisibility = (): void => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      pulses.clear();
    } else {
      markAllDirty();
      wake();
    }
  };

  map.on('click', onClick);
  map.on('mousemove', onMove);
  map.on('mouseout', onLeave);
  map.on('zoom', updateLevel);
  map.on('error', () => {
    /* tile/risorse non raggiungibili: la mappa resta usabile su sfondo scuro */
  });
  document.addEventListener('visibilitychange', onVisibility);
  const unsub = store.subscribe(onStoreEvent);

  const basemapAbort = new AbortController();
  map.on('load', () => {
    if (destroyed) return;
    addDataLayers(map, collection([]));
    void fetchBasemap(basemapAbort.signal).then((cfg) => {
      if (cfg && !destroyed) addBasemap(map, cfg, LAYER.areaGlow);
    });
    ready = true;
    level = levelForZoom(map.getZoom(), store.selection);
    setLevelVisibility(map, level);
    if (store.incidents.size) onStoreEvent({ kind: 'snapshot' });
    markAllDirty();
    updateLevel();
    wake();
  });
  updateLevel();

  // catalogo quartieri: opzionale, il fallback usa le medie delle coordinate delle chiamate
  (opts.loadAreas ?? defaultLoadAreas)()
    .then((list) => {
      if (destroyed || !Array.isArray(list)) return;
      for (const a of list) if (a && typeof a.id === 'string' && Number.isFinite(a.lat) && Number.isFinite(a.lng)) areas.set(a.id, a);
      areaDirty = true;
      wake();
    })
    .catch(() => {
      /* catalogo non disponibile: si usano i centroidi derivati dalle chiamate */
    });

  return () => {
    destroyed = true;
    basemapAbort.abort();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    unsub();
    document.removeEventListener('visibilitychange', onVisibility);
    reduced?.removeEventListener('change', onReducedChange);
    map.off('click', onClick);
    map.off('mousemove', onMove);
    map.off('mouseout', onLeave);
    map.off('zoom', updateLevel);
    popupFor = '';
    popup?.remove();
    hideTip();
    badge.destroy();
    map.remove();
    removeStyle();
  };
}
