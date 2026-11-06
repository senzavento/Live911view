import {
  INCIDENT_TYPES,
  type City,
  type CitySummary,
  type Incident,
  type NationalSummary,
  type StateDetail,
  type StateInfo,
  type StateSummary,
  type TimelinePoint,
  type TypeCounts,
} from '@live911/shared';
import { MinuteRing } from './minuteRing';
import type { SourceEvent } from './source';

const T = INCIDENT_TYPES.length;
const CH_RESP_SUM = T;
const CH_RESP_COUNT = T + 1;
const CHANNELS = T + 2;
const TIMELINE_MINUTES = 60;
const RATE_MINUTES = 5;

const typeIndex = new Map(INCIDENT_TYPES.map((t, i) => [t, i]));

export function emptyTypeCounts(): TypeCounts {
  return { fire: 0, medical: 0, police: 0, traffic: 0, hazmat: 0, rescue: 0 };
}

/** Sum of the first n values (drops the partial current minute at the end). */
const sumFirst = (values: number[], n: number): number => values.slice(0, n).reduce((a, b) => a + b, 0);

function countsFrom(arr: Int32Array, base: number): TypeCounts {
  const out = emptyTypeCounts();
  INCIDENT_TYPES.forEach((type, t) => {
    out[type] = arr[base + t] as number;
  });
  return out;
}

/**
 * Incrementally maintained counters. Each event is O(1); reads cost
 * O(states + 60) for the national view and O(60) for a city.
 */
export class Aggregator {
  private readonly cityIndex = new Map<string, number>();
  private readonly stateIndex = new Map<string, number>();
  private readonly cityState: number[];
  private readonly statePopulation: number[];
  private readonly cityActive: Int32Array;
  private readonly cityCritical: Int32Array;
  private readonly stateActive: Int32Array;
  private readonly stateCritical: Int32Array;
  private readonly nationalActive = new Int32Array(T);
  private nationalCritical = 0;
  private readonly cityRings: MinuteRing[];
  private readonly nationalRing = new MinuteRing(CHANNELS);

  constructor(
    private readonly cities: readonly City[],
    private readonly states: readonly StateInfo[],
    private readonly clock: () => number,
  ) {
    cities.forEach((c, i) => this.cityIndex.set(c.id, i));
    states.forEach((s, i) => this.stateIndex.set(s.code, i));
    this.cityState = cities.map((c) => this.stateIndex.get(c.state) ?? -1);
    this.statePopulation = states.map(() => 0);
    cities.forEach((c, i) => {
      const s = this.cityState[i] as number;
      if (s >= 0) this.statePopulation[s] = (this.statePopulation[s] as number) + c.population;
    });
    this.cityActive = new Int32Array(cities.length * T);
    this.cityCritical = new Int32Array(cities.length);
    this.stateActive = new Int32Array(states.length * T);
    this.stateCritical = new Int32Array(states.length);
    this.cityRings = cities.map(() => new MinuteRing(CHANNELS));
  }

  /** `prev` is the previously active version of the incident (from IncidentStore.apply). */
  ingest(event: SourceEvent, prev: Incident | undefined): void {
    if (event.kind === 'history') {
      this.recordHistory(event.cityId, event.at, event.counts);
      return;
    }
    const { incident } = event;
    if (prev) this.track(prev, -1);
    if (event.kind !== 'resolved') this.track(incident, 1);
    if (event.kind === 'created' && !prev) this.recordCreated(incident);
    if (event.kind === 'updated' && prev?.status === 'dispatched' && incident.status === 'on_scene') {
      this.recordArrival(incident);
    }
  }

  nationalSummary(): NationalSummary {
    const now = this.clock();
    const ring = this.nationalRing;
    const created5 = INCIDENT_TYPES.reduce(
      (sum, _t, t) => sum + sumFirst(ring.series(t, now, RATE_MINUTES + 1), RATE_MINUTES),
      0,
    );
    return {
      generatedAt: new Date(now).toISOString(),
      active: this.nationalActive.reduce((a, b) => a + b, 0),
      last24h: INCIDENT_TYPES.reduce((sum, _t, t) => sum + ring.total(t, now), 0),
      ratePerMin: Math.round((created5 / RATE_MINUTES) * 10) / 10,
      critical: this.nationalCritical,
      avgResponseSec: this.avgResponse(ring, now),
      byType: countsFrom(this.nationalActive, 0),
      byState: this.states.map((_s, i) => this.stateSummary(i)),
      timeline: this.timeline(ring, now),
    };
  }

  stateDetail(code: string): StateDetail | undefined {
    const idx = this.stateIndex.get(code);
    if (idx === undefined) return undefined;
    const cities = this.cities.flatMap((c, i) => (this.cityState[i] === idx ? [this.buildCitySummary(i)] : []));
    return { ...this.stateSummary(idx), cities };
  }

  citySummary(id: string): CitySummary | undefined {
    const idx = this.cityIndex.get(id);
    return idx === undefined ? undefined : this.buildCitySummary(idx);
  }

  private stateSummary(idx: number): StateSummary {
    const state = this.states[idx] as StateInfo;
    const byType = countsFrom(this.stateActive, idx * T);
    const active = INCIDENT_TYPES.reduce((sum, t) => sum + byType[t], 0);
    const pop = this.statePopulation[idx] as number;
    return {
      code: state.code,
      name: state.name,
      active,
      critical: this.stateCritical[idx] as number,
      byType,
      per100k: pop > 0 ? Math.round((active / pop) * 100_000 * 100) / 100 : 0,
    };
  }

  private buildCitySummary(idx: number): CitySummary {
    const now = this.clock();
    const ring = this.cityRings[idx] as MinuteRing;
    const byType = countsFrom(this.cityActive, idx * T);
    return {
      city: this.cities[idx] as City,
      active: INCIDENT_TYPES.reduce((sum, t) => sum + byType[t], 0),
      critical: this.cityCritical[idx] as number,
      last24h: INCIDENT_TYPES.reduce((sum, _t, t) => sum + ring.total(t, now), 0),
      byType,
      avgResponseSec: this.avgResponse(ring, now),
      timeline: this.timeline(ring, now),
    };
  }

  private avgResponse(ring: MinuteRing, now: number): number {
    const count = ring.windowSum(CH_RESP_COUNT, now, TIMELINE_MINUTES);
    return count === 0 ? 0 : Math.round(ring.windowSum(CH_RESP_SUM, now, TIMELINE_MINUTES) / count);
  }

  private timeline(ring: MinuteRing, now: number): TimelinePoint[] {
    const perType = INCIDENT_TYPES.map((_t, t) => ring.series(t, now, TIMELINE_MINUTES));
    const nowMinute = Math.floor(now / 60_000);
    return Array.from({ length: TIMELINE_MINUTES }, (_v, i) => {
      const byType = emptyTypeCounts();
      INCIDENT_TYPES.forEach((type, t) => {
        byType[type] = (perType[t] as number[])[i] as number;
      });
      const minute = nowMinute - (TIMELINE_MINUTES - 1 - i);
      return {
        t: new Date(minute * 60_000).toISOString(),
        total: INCIDENT_TYPES.reduce((sum, type) => sum + byType[type], 0),
        byType,
      };
    });
  }

  /** Adds (+1) or removes (-1) an incident from the live counters. */
  private track(incident: Incident, sign: 1 | -1): void {
    const c = this.cityIndex.get(incident.cityId);
    const t = typeIndex.get(incident.type);
    if (c === undefined || t === undefined) return;
    const s = this.cityState[c] as number;
    const critical = incident.priority === 1 ? sign : 0;
    this.bump(this.cityActive, c * T + t, sign);
    this.bump(this.nationalActive, t, sign);
    this.cityCritical[c] = (this.cityCritical[c] as number) + critical;
    this.nationalCritical += critical;
    if (s >= 0) {
      this.bump(this.stateActive, s * T + t, sign);
      this.stateCritical[s] = (this.stateCritical[s] as number) + critical;
    }
  }

  private bump(arr: Int32Array, idx: number, by: number): void {
    arr[idx] = (arr[idx] as number) + by;
  }

  private recordCreated(incident: Incident): void {
    const c = this.cityIndex.get(incident.cityId);
    const t = typeIndex.get(incident.type);
    if (c === undefined || t === undefined) return;
    this.addToRings(c, t, Date.parse(incident.createdAt), 1);
  }

  private recordArrival(incident: Incident): void {
    const c = this.cityIndex.get(incident.cityId);
    if (c === undefined) return;
    const arrivedAt = Date.parse(incident.updatedAt);
    const seconds = Math.max(0, Math.round((arrivedAt - Date.parse(incident.createdAt)) / 1000));
    this.addToRings(c, CH_RESP_SUM, arrivedAt, seconds);
    this.addToRings(c, CH_RESP_COUNT, arrivedAt, 1);
  }

  private recordHistory(cityId: string, at: number, counts: TypeCounts): void {
    const c = this.cityIndex.get(cityId);
    if (c === undefined) return;
    INCIDENT_TYPES.forEach((type, t) => {
      if (counts[type] > 0) this.addToRings(c, t, at, counts[type]);
    });
  }

  private addToRings(cityIdx: number, channel: number, atMs: number, value: number): void {
    (this.cityRings[cityIdx] as MinuteRing).add(channel, atMs, value);
    this.nationalRing.add(channel, atMs, value);
  }
}
