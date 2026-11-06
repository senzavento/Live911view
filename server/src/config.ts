import type { BasemapConfig } from '@live911/shared';

export interface Config {
  port: number;
  host: string;
  simRate: number;
  simSeed: number;
  corsOrigins: string[];
  logLevel: string;
  /** Built web app to serve, or undefined to run API-only. */
  staticDir: string | undefined;
  basemap: BasemapConfig | null;
}

type Env = Record<string, string | undefined>;

function number(env: Env, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${key} must be a number between ${min} and ${max}, got "${raw}"`);
  }
  return n;
}

export function loadBasemap(env: Env): BasemapConfig | null {
  const tiles = env.BASEMAP_TILES?.trim();
  if (!tiles) return null;
  let url: URL;
  try {
    url = new URL(tiles.replace(/\{[zxy]\}/g, '0'));
  } catch {
    throw new Error('BASEMAP_TILES must be a valid URL');
  }
  if (url.protocol !== 'https:') throw new Error('BASEMAP_TILES must use https');
  for (const token of ['{z}', '{x}', '{y}']) {
    if (!tiles.includes(token)) throw new Error(`BASEMAP_TILES must contain ${token}`);
  }
  const tileSize = Math.trunc(number(env, 'BASEMAP_TILE_SIZE', 256, 256, 512));
  if (tileSize !== 256 && tileSize !== 512) throw new Error('BASEMAP_TILE_SIZE must be 256 or 512');
  return {
    tiles,
    tileSize,
    maxzoom: Math.trunc(number(env, 'BASEMAP_MAX_ZOOM', 18, 0, 22)),
    attribution: env.BASEMAP_ATTRIBUTION?.trim() || '© OpenStreetMap contributors',
  };
}

export function loadConfig(env: Env = process.env): Config {
  return {
    port: Math.trunc(number(env, 'PORT', 8787, 0, 65535)),
    host: env.HOST || '0.0.0.0',
    // mean national new incidents/s; the default settles at roughly 4-5k active
    simRate: number(env, 'SIM_RATE', 16, 0.1, 500),
    simSeed: Math.trunc(number(env, 'SIM_SEED', Date.now() % 2 ** 31, 0, 2 ** 32 - 1)),
    corsOrigins: (env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
    logLevel: env.LOG_LEVEL || 'info',
    staticDir: env.STATIC_DIR || undefined,
    basemap: loadBasemap(env),
  };
}
