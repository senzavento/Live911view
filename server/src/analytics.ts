import {
  INCIDENT_TYPES,
  type AreaDetail,
  type AreaInfo,
  type AreaSummary,
  type CitySummary,
  type Counts,
  type Incident,
  type IntersectionDetail,
  type IntersectionSummary,
  type SourceStatus,
  type TimelinePoint,
  type TypeCounts,
} from '@live911/shared';
import type { IncidentStore } from './store';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const BUCKETS = 24;
const MIN_DISPATCH_SAMPLES = 10;
const MAX_AREA_INTERSECTIONS = 50;
const MAX_INTERSECTION_INCIDENTS = 100;
/** Derived data is recomputed at most this often (and whenever the store changes). */
const CACHE_MS = 2000;

export const emptyTypeCounts = (): TypeCounts => ({
  violent: 0, property: 0, traffic: 0, disturbance: 0, welfare: 0, alarm: 0, proactive: 0, other: 0,
});

interface Acc {
  active: number;
  critical: number;
  last24h: number;
  byType: TypeCounts;
  buckets: TypeCounts[];
  dispatchSum: number;
  dispatchN: number;
}

const newAcc = (): Acc => ({
  active: 0,
  critical: 0,
  last24h: 0,
  byType: emptyTypeCounts(),
  buckets: Array.from({ length: BUCKETS }, emptyTypeCounts),
  dispatchSum: 0,
  dispatchN: 0,
});

interface IntersectionAcc extends Acc {
  id: string;
  name: string;
  areaId: string;
  lat: number;
  lng: number;
  /** createdAt of the incident that set name/area/position: the newest wins */
  latest: string;
  incidents: Incident[];
}

interface Index {
  generatedAt: number;
  city: Acc;
  unlocated24h: number;
  ratePerHour: number;
  areas: Map<string, Acc>;
  intersections: Map<string, IntersectionAcc>;
}

const sumTypes = (c: TypeCounts): number => INCIDENT_TYPES.reduce((s, t) => s + c[t], 0);
const countsOf = (a: Acc): Counts => ({ active: a.active, last24h: a.last24h, critical: a.critical, byType: { ...a.byType } });
const avgDispatch = (a: Acc): number | null => (a.dispatchN < MIN_DISPATCH_SAMPLES ? null : Math.round(a.dispatchSum / a.dispatchN));

function timelineOf(a: Acc, nowMs: number): TimelinePoint[] {
  const firstHour = Math.floor(nowMs / HOUR_MS) * HOUR_MS - (BUCKETS - 1) * HOUR_MS;
  return a.buckets.map((byType, i) => ({ t: new Date(firstHour + i * HOUR_MS).toISOString(), total: sumTypes(byType), byType: { ...byType } }));
}

function addIncident(acc: Acc, i: Incident, receivedMs: number, nowMs: number): void {
  if (i.status !== 'resolved') {
    acc.active++;
    acc.byType[i.type]++;
    if (i.priority === 1) acc.critical++;
  }
  if (receivedMs <= nowMs - DAY_MS) return;
  acc.last24h++;
  const bucket = BUCKETS - 1 - (Math.floor(nowMs / HOUR_MS) - Math.floor(receivedMs / HOUR_MS));
  const slot = acc.buckets[bucket];
  if (slot) slot[i.type]++;
  if (!i.officerInitiated && i.dispatchedAt) {
    const wait = (Date.parse(i.dispatchedAt) - receivedMs) / 1000;
    if (wait >= 0) {
      acc.dispatchSum += wait;
      acc.dispatchN++;
    }
  }
}

function intersectionAcc(map: Map<string, IntersectionAcc>, i: Incident): IntersectionAcc {
  let acc = map.get(i.intersectionId);
  if (!acc) {
    acc = { ...newAcc(), id: i.intersectionId, name: i.address, areaId: i.areaId, lat: i.lat, lng: i.lng, latest: i.createdAt, incidents: [] };
    map.set(i.intersectionId, acc);
  } else if (i.createdAt > acc.latest) {
    Object.assign(acc, { name: i.address, areaId: i.areaId, lat: i.lat, lng: i.lng, latest: i.createdAt });
  }
  return acc;
}

function buildIndex(store: IncidentStore, nowMs: number): Index {
  const index: Index = {
    generatedAt: nowMs, city: newAcc(), unlocated24h: 0, ratePerHour: 0, areas: new Map(), intersections: new Map(),
  };
  for (const i of store.all()) {
    const receivedMs = Date.parse(i.createdAt);
    const area = index.areas.get(i.areaId) ?? newAcc();
    index.areas.set(i.areaId, area);
    const cell = intersectionAcc(index.intersections, i);
    cell.incidents.push(i);
    for (const acc of [index.city, area, cell]) addIncident(acc, i, receivedMs, nowMs);
    if (receivedMs > nowMs - HOUR_MS) index.ratePerHour++;
  }
  for (const c of store.unlocated()) {
    if (c.receivedMs > nowMs - DAY_MS) index.unlocated24h++;
    if (c.receivedMs > nowMs - HOUR_MS) index.ratePerHour++;
  }
  return index;
}

const byBusiness = <T extends Counts & { id: string }>(a: T, b: T): number =>
  b.active - a.active || b.last24h - a.last24h || (a.id < b.id ? -1 : 1);

/** Read-side views over the store; derived data is cached per store version and 2 s time slot. */
export class Analytics {
  private cached: { version: number; slot: number; index: Index } | undefined;

  constructor(
    private readonly store: IncidentStore,
    private readonly clock: () => number,
    private readonly sourceStatus: () => SourceStatus,
  ) {}

  citySummary(): CitySummary {
    const index = this.index();
    return {
      generatedAt: new Date(index.generatedAt).toISOString(),
      ...countsOf(index.city),
      last24h: index.city.last24h + index.unlocated24h,
      ratePerHour: index.ratePerHour,
      avgDispatchSec: avgDispatch(index.city),
      unlocated24h: index.unlocated24h,
      timeline: timelineOf(index.city, index.generatedAt),
      byArea: this.areaSummaries(index),
      source: this.sourceStatus(),
    };
  }

  areas(): AreaInfo[] {
    return this.store.areas().map(({ id, name, lat, lng }) => ({ id, name, lat, lng }));
  }

  areaDetail(id: string): AreaDetail | undefined {
    const index = this.index();
    const info = this.store.area(id);
    if (!info) return undefined;
    const acc = index.areas.get(id) ?? newAcc();
    const intersections = [...index.intersections.values()]
      .filter((x) => x.areaId === id && (x.active > 0 || x.last24h > 0))
      .map(toIntersectionSummary)
      .sort(byBusiness)
      .slice(0, MAX_AREA_INTERSECTIONS);
    return {
      ...toAreaSummary(info, acc),
      avgDispatchSec: avgDispatch(acc),
      timeline: timelineOf(acc, index.generatedAt),
      intersections,
    };
  }

  intersectionDetail(id: string): IntersectionDetail | undefined {
    const acc = this.index().intersections.get(id);
    if (!acc) return undefined;
    const incidents = [...acc.incidents]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
      .slice(0, MAX_INTERSECTION_INCIDENTS);
    return { ...toIntersectionSummary(acc), incidents };
  }

  private areaSummaries(index: Index): AreaSummary[] {
    return this.store
      .areas()
      .map((info) => toAreaSummary(info, index.areas.get(info.id) ?? newAcc()))
      .sort(byBusiness);
  }

  private index(): Index {
    this.store.prune();
    const now = this.clock();
    const slot = Math.floor(now / CACHE_MS);
    const hit = this.cached;
    if (hit && hit.version === this.store.version && hit.slot === slot) return hit.index;
    const index = buildIndex(this.store, now);
    this.cached = { version: this.store.version, slot, index };
    return index;
  }
}

const toAreaSummary = (info: AreaInfo, acc: Acc): AreaSummary => ({ id: info.id, name: info.name, lat: info.lat, lng: info.lng, ...countsOf(acc) });

const toIntersectionSummary = (x: IntersectionAcc): IntersectionSummary => ({
  id: x.id, name: x.name, areaId: x.areaId, lat: x.lat, lng: x.lng, ...countsOf(x),
});
