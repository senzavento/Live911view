/** Offset deterministico per chiamate sovrapposte (stesso incrocio): le rende visibili tutte senza spostare l'incrocio. */

export const JITTER_MAX_M = 15;
const JITTER_MIN_M = 3;
const M_PER_DEG_LAT = 111_320;

/** FNV-1a 32 bit. */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let k = 0; k < id.length; k++) {
    h ^= id.charCodeAt(k);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Offset in metri (est, nord) dentro un disco di raggio JITTER_MAX_M, distribuzione ~uniforme. */
export function jitterMeters(id: string): { east: number; north: number } {
  const h = hashId(id);
  const angle = ((h & 0xffff) / 0x10000) * Math.PI * 2;
  const u = (Math.imul(h >>> 16, 0x9e3779b1) >>> 0) / 0x100000000;
  const r = JITTER_MIN_M + (JITTER_MAX_M - JITTER_MIN_M) * Math.sqrt(u);
  return { east: r * Math.cos(angle), north: r * Math.sin(angle) };
}

/** Posizione [lng, lat] con offset applicato. */
export function jitteredPosition(id: string, lng: number, lat: number): [number, number] {
  const { east, north } = jitterMeters(id);
  const dLat = north / M_PER_DEG_LAT;
  const dLng = east / (M_PER_DEG_LAT * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  return [lng + dLng, lat + dLat];
}
