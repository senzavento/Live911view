import { INCIDENT_TYPES } from '@live911/shared';
import type { Incident, IncidentType, TypeCounts } from '@live911/shared';

export interface Bucket {
  active: number;
  critical: number;
  byType: TypeCounts;
}

export interface CityBucket extends Bucket {
  state: string;
  /** somme coordinate degli incidenti attivi: fallback se il catalogo città manca */
  sumLat: number;
  sumLng: number;
}

export function emptyCounts(): TypeCounts {
  return { fire: 0, medical: 0, police: 0, traffic: 0, hazmat: 0, rescue: 0 };
}

/** Tipo prevalente (a parità vince l'ordine di INCIDENT_TYPES); null se non c'è nulla. */
export function dominantType(counts: TypeCounts): IncidentType | null {
  return topTypes(counts)[0] ?? null;
}

/** Tipi con conteggio > 0, dal più frequente. */
export function topTypes(counts: TypeCounts): IncidentType[] {
  return INCIDENT_TYPES.filter((t) => counts[t] > 0).sort((a, b) => counts[b] - counts[a]);
}

interface Contribution {
  state: string;
  cityId: string;
  type: IncidentType;
  critical: boolean;
  lat: number;
  lng: number;
}

/**
 * Aggregazione incrementale per stato e città: ogni evento costa O(1).
 * Tiene la "contribuzione" corrente di ogni incidente per poterla sottrarre
 * quando l'incidente cambia (updated) o termina (resolved).
 */
export class Aggregator {
  readonly states = new Map<string, Bucket>();
  readonly cities = new Map<string, CityBucket>();
  readonly dirtyStates = new Set<string>();
  readonly dirtyCities = new Set<string>();
  private readonly contrib = new Map<string, Contribution>();

  clear(): void {
    for (const k of this.states.keys()) this.dirtyStates.add(k);
    for (const k of this.cities.keys()) this.dirtyCities.add(k);
    this.states.clear();
    this.cities.clear();
    this.contrib.clear();
  }

  rebuild(incidents: Iterable<Incident>): void {
    this.clear();
    for (const i of incidents) this.apply('created', i);
  }

  apply(op: 'created' | 'updated' | 'resolved', i: Incident): void {
    const prev = this.contrib.get(i.id);
    if (prev) {
      this.add(prev, -1);
      this.contrib.delete(i.id);
    }
    if (op === 'resolved' || i.status === 'resolved') return;
    const c: Contribution = {
      state: i.state,
      cityId: i.cityId,
      type: i.type,
      critical: i.priority === 1,
      lat: i.lat,
      lng: i.lng,
    };
    this.contrib.set(i.id, c);
    this.add(c, 1);
  }

  get total(): number {
    return this.contrib.size;
  }

  private add(c: Contribution, d: 1 | -1): void {
    let s = this.states.get(c.state);
    if (!s) this.states.set(c.state, (s = { active: 0, critical: 0, byType: emptyCounts() }));
    s.active += d;
    s.byType[c.type] += d;
    if (c.critical) s.critical += d;
    this.dirtyStates.add(c.state);

    let ci = this.cities.get(c.cityId);
    if (!ci)
      this.cities.set(
        c.cityId,
        (ci = { state: c.state, active: 0, critical: 0, byType: emptyCounts(), sumLat: 0, sumLng: 0 }),
      );
    ci.active += d;
    ci.byType[c.type] += d;
    ci.sumLat += c.lat * d;
    ci.sumLng += c.lng * d;
    if (c.critical) ci.critical += d;
    this.dirtyCities.add(c.cityId);
  }
}

/** Raggio (px) della bolla ∝ sqrt(attivi). */
export function bubbleRadius(active: number, base: number, k: number, max: number): number {
  return Math.min(max, base + k * Math.sqrt(Math.max(0, active)));
}

/** Etichetta compatta del conteggio: 999, 1.2k, 12k. */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(n / 1000)}k`;
}
