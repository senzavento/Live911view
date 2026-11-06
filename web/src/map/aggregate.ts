import { INCIDENT_TYPES } from '@live911/shared';
import type { Incident, IncidentType, TypeCounts } from '@live911/shared';

export interface Bucket {
  /** nome per etichette/tooltip (ultimo visto) */
  name: string;
  active: number;
  critical: number;
  byType: TypeCounts;
  /** somme coordinate degli incidenti attivi: la media è la posizione di ripiego */
  sumLat: number;
  sumLng: number;
}

export interface IntersectionBucket extends Bucket {
  areaId: string;
  areaName: string;
}

export function emptyCounts(): TypeCounts {
  return { violent: 0, property: 0, traffic: 0, disturbance: 0, welfare: 0, alarm: 0, proactive: 0, other: 0 };
}

/** Tipi con conteggio > 0, dal più frequente (a parità: ordine di INCIDENT_TYPES). */
export function topTypes(counts: TypeCounts): IncidentType[] {
  return INCIDENT_TYPES.filter((t) => counts[t] > 0).sort((a, b) => counts[b] - counts[a]);
}

/** Tipo prevalente; null se non c'è nulla. */
export function dominantType(counts: TypeCounts): IncidentType | null {
  return topTypes(counts)[0] ?? null;
}

interface Contribution {
  areaId: string;
  areaName: string;
  intersectionId: string;
  address: string;
  type: IncidentType;
  critical: boolean;
  lat: number;
  lng: number;
}

/**
 * Aggregazione incrementale per quartiere e incrocio: ogni evento costa O(1).
 * Tiene la "contribuzione" corrente di ogni chiamata per poterla sottrarre
 * quando cambia (updated) o termina (resolved). I bucket vuoti vengono eliminati.
 */
export class Aggregator {
  readonly areas = new Map<string, Bucket>();
  readonly intersections = new Map<string, IntersectionBucket>();
  private readonly contrib = new Map<string, Contribution>();

  clear(): void {
    this.areas.clear();
    this.intersections.clear();
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
      areaId: i.areaId,
      areaName: i.areaName,
      intersectionId: i.intersectionId,
      address: i.address,
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
    let a = this.areas.get(c.areaId);
    if (!a) this.areas.set(c.areaId, (a = newBucket(c.areaName)));
    bump(a, c, d);
    if (a.active <= 0) this.areas.delete(c.areaId);

    let x = this.intersections.get(c.intersectionId);
    if (!x) this.intersections.set(c.intersectionId, (x = { ...newBucket(c.address), areaId: c.areaId, areaName: c.areaName }));
    bump(x, c, d);
    if (x.active <= 0) this.intersections.delete(c.intersectionId);
  }
}

function newBucket(name: string): Bucket {
  return { name, active: 0, critical: 0, byType: emptyCounts(), sumLat: 0, sumLng: 0 };
}

function bump(b: Bucket, c: Contribution, d: 1 | -1): void {
  b.active += d;
  b.byType[c.type] += d;
  if (c.critical) b.critical += d;
  b.sumLat += c.lat * d;
  b.sumLng += c.lng * d;
}

/** Posizione media delle chiamate attive di un bucket. */
export function bucketCentroid(b: Bucket): { lat: number; lng: number } {
  return { lat: b.sumLat / b.active, lng: b.sumLng / b.active };
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
