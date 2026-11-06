import type { AppConfig, BasemapConfig } from '@live911/shared';
import type * as maplibregl from 'maplibre-gl';

const SOURCE_ID = 'l911-basemap';
const LAYER_ID = 'l911-basemap-layer';

/** Validates the untrusted /api/config payload; anything unexpected means "no basemap". */
export function parseBasemap(payload: unknown): BasemapConfig | null {
  const b = (payload as Partial<AppConfig> | null)?.basemap;
  if (!b || typeof b !== 'object') return null;
  const { tiles, tileSize, maxzoom, attribution } = b;
  if (typeof tiles !== 'string' || !tiles.startsWith('https://')) return null;
  if (!['{z}', '{x}', '{y}'].every((t) => tiles.includes(t))) return null;
  if (tileSize !== 256 && tileSize !== 512) return null;
  if (typeof maxzoom !== 'number' || !Number.isFinite(maxzoom)) return null;
  if (typeof attribution !== 'string') return null;
  return { tiles, tileSize, maxzoom, attribution };
}

export async function fetchBasemap(signal?: AbortSignal): Promise<BasemapConfig | null> {
  try {
    const res = await fetch('/api/config', { signal });
    return res.ok ? parseBasemap(await res.json()) : null;
  } catch {
    return null;
  }
}

/** Adds the operator-configured raster basemap below the data layers (`beforeId`). */
export function addBasemap(map: maplibregl.Map, cfg: BasemapConfig, beforeId: string): void {
  if (map.getSource(SOURCE_ID)) return;
  map.addSource(SOURCE_ID, {
    type: 'raster',
    tiles: [cfg.tiles],
    tileSize: cfg.tileSize,
    maxzoom: cfg.maxzoom,
    // Rendered by MapLibre as HTML: escape so the config can only ever be text.
    attribution: cfg.attribution.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
  });
  map.addLayer(
    { id: LAYER_ID, type: 'raster', source: SOURCE_ID, paint: { 'raster-opacity': 0.9, 'raster-fade-duration': 150 } },
    beforeId,
  );
}
