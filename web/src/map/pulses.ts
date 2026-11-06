/** Insieme di pulse effimeri (nascita = onda espansiva, fine = dissolvenza). Logica pura, tempo iniettato. */

export type PulseKind = 'birth' | 'fade';

export interface Pulse {
  kind: PulseKind;
  lng: number;
  lat: number;
  color: string;
  critical: boolean;
  start: number;
  duration: number;
}

export interface PulseFrame {
  kind: PulseKind;
  lng: number;
  lat: number;
  color: string;
  /** raggio px */
  r: number;
  /** opacità 0..1 */
  o: number;
  /** spessore del bordo px */
  w: number;
}

export const BIRTH_MS = 1700;
export const BIRTH_CRITICAL_MS = 2400;
export const FADE_MS = 1400;
export const MAX_PULSES = 250;

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

export class PulseSet {
  private items: Pulse[] = [];

  get size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }

  add(p: Omit<Pulse, 'duration'>): void {
    const duration = p.kind === 'fade' ? FADE_MS : p.critical ? BIRTH_CRITICAL_MS : BIRTH_MS;
    this.items.push({ ...p, duration });
    // ciclo di vita limitato anche sotto raffiche: scarta i più vecchi
    if (this.items.length > MAX_PULSES) this.items.splice(0, this.items.length - MAX_PULSES);
  }

  /** Rimuove i pulse scaduti e restituisce i frame da disegnare a `now`. */
  frames(now: number): PulseFrame[] {
    const out: PulseFrame[] = [];
    const alive: Pulse[] = [];
    for (const p of this.items) {
      const t = (now - p.start) / p.duration;
      if (t >= 1) continue;
      alive.push(p);
      if (t < 0) continue;
      const e = easeOut(t);
      if (p.kind === 'birth') {
        const max = p.critical ? 46 : 30;
        out.push({ kind: 'birth', lng: p.lng, lat: p.lat, color: p.color, r: 4 + max * e, o: 0.95 * (1 - t), w: 2.2 * (1 - t) + 0.6 });
        // seconda onda ritardata
        const t2 = t - 0.28;
        if (t2 > 0) {
          const e2 = easeOut(t2 / 0.72);
          out.push({ kind: 'birth', lng: p.lng, lat: p.lat, color: p.color, r: 4 + max * 0.75 * e2, o: 0.6 * (1 - t2 / 0.72), w: 1.4 });
        }
      } else {
        out.push({ kind: 'fade', lng: p.lng, lat: p.lat, color: p.color, r: 6 * (1 - e) + 1, o: 0.8 * (1 - t), w: 0 });
      }
    }
    this.items = alive;
    return out;
  }
}
