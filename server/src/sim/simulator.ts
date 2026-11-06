import { INCIDENT_TYPES, type City, type Incident, type IncidentType, type TypeCounts } from '@live911/shared';
import { utcOffsetHours } from '../data/timezones';
import type { IncidentSource, SourceEvent, SourceListener, Unsubscribe } from '../source';
import { scatterAround, scatterSigmaKm, syntheticAddress } from './places';
import { PROFILES, PROFILE_LIST, pickPriority } from './profile';
import { Random } from './random';

export interface SimulatorOptions {
  cities: readonly City[];
  /** mean national new incidents per second (daily average) */
  ratePerSec: number;
  seed: number;
  /** tick period of the real-time loop */
  tickMs?: number;
}

interface Tracked {
  incident: Incident;
  /** epoch ms of the next lifecycle transition */
  nextAt: number;
  onSceneSec: number;
}

const TYPE_COUNT = INCIDENT_TYPES.length;
const STEP_MS = 1000;
const WARMUP_MS = 60 * 60_000;
const HISTORY_MS = 24 * 60 * 60_000;
const HISTORY_CHUNK_MS = 10 * 60_000;
const MAX_CATCHUP_MS = 60_000;

/** Synthetic 911 traffic: Poisson arrivals weighted by city population and local time of day. */
export class Simulator implements IncidentSource {
  private readonly rng: Random;
  private readonly listeners = new Set<SourceListener>();
  private readonly active = new Map<string, Tracked>();
  private readonly offsets: number[];
  private readonly sigmas: number[];
  private readonly totalPopulation: number;
  private readonly cityWeights: Float64Array;
  private readonly typeWeights: Float64Array;
  private readonly tickMs: number;
  private seq = 0;
  private cursor: number | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly opts: SimulatorOptions) {
    this.rng = new Random(opts.seed);
    this.tickMs = opts.tickMs ?? 250;
    this.offsets = opts.cities.map((c) => utcOffsetHours(c.state, c.lng));
    this.sigmas = opts.cities.map((c) => scatterSigmaKm(c.population));
    this.totalPopulation = opts.cities.reduce((sum, c) => sum + c.population, 0);
    this.cityWeights = new Float64Array(opts.cities.length);
    this.typeWeights = new Float64Array(opts.cities.length * TYPE_COUNT);
  }

  subscribe(listener: SourceListener): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get activeCount(): number {
    return this.active.size;
  }

  /** Emits the last 24h of aggregate history, then simulates the last hour in detail. */
  prime(nowMs: number): void {
    this.emitHistory(nowMs - HISTORY_MS, nowMs - WARMUP_MS);
    this.cursor = nowMs - WARMUP_MS;
    this.advance(nowMs);
  }

  start(): void {
    if (this.timer) return;
    this.prime(Date.now());
    this.timer = setInterval(() => this.tick(Date.now()), this.tickMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Advances simulated time to `nowMs`. Public so tests can drive a virtual clock. */
  tick(nowMs: number): void {
    if (this.cursor === null) {
      this.cursor = nowMs;
      return;
    }
    if (nowMs - this.cursor > MAX_CATCHUP_MS) this.cursor = nowMs - MAX_CATCHUP_MS;
    this.advance(nowMs);
  }

  private advance(nowMs: number): void {
    while (this.cursor !== null && this.cursor < nowMs) {
      const dt = Math.min(STEP_MS, nowMs - this.cursor);
      this.cursor += dt;
      this.progressLifecycles(this.cursor);
      this.spawn(this.cursor, dt);
    }
  }

  private emit(event: SourceEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private localHour(cityIdx: number, atMs: number): number {
    const utcHour = (atMs / 3_600_000) % 24;
    return (utcHour + (this.offsets[cityIdx] ?? 0) + 24) % 24;
  }

  /** Fills cityWeights/typeWeights for the instant; returns the summed weight. */
  private computeWeights(atMs: number): number {
    let total = 0;
    this.opts.cities.forEach((city, c) => {
      const hour = this.localHour(c, atMs);
      let sum = 0;
      PROFILE_LIST.forEach((profile, t) => {
        const w = profile.mix * profile.activity(hour);
        this.typeWeights[c * TYPE_COUNT + t] = w;
        sum += w;
      });
      const weight = city.population * sum;
      this.cityWeights[c] = weight;
      total += weight;
    });
    return total;
  }

  private spawn(atMs: number, dtMs: number): void {
    const total = this.computeWeights(atMs);
    const mean = (this.opts.ratePerSec * (dtMs / 1000) * total) / this.totalPopulation;
    const count = this.rng.poisson(mean);
    for (let i = 0; i < count; i++) {
      const cityIdx = this.sampleCity(total);
      this.createIncident(cityIdx, this.sampleType(cityIdx), atMs - this.rng.next() * dtMs);
    }
  }

  private sampleCity(total: number): number {
    let u = this.rng.next() * total;
    for (let c = 0; c < this.cityWeights.length; c++) {
      u -= this.cityWeights[c] as number;
      if (u <= 0) return c;
    }
    return this.cityWeights.length - 1;
  }

  private sampleType(cityIdx: number): IncidentType {
    const base = cityIdx * TYPE_COUNT;
    let sum = 0;
    for (let t = 0; t < TYPE_COUNT; t++) sum += this.typeWeights[base + t] as number;
    let u = this.rng.next() * sum;
    for (let t = 0; t < TYPE_COUNT; t++) {
      u -= this.typeWeights[base + t] as number;
      if (u <= 0) return INCIDENT_TYPES[t] as IncidentType;
    }
    return 'medical';
  }

  private createIncident(cityIdx: number, type: IncidentType, atMs: number): void {
    const city = this.opts.cities[cityIdx] as City;
    const profile = PROFILES[type];
    const priority = pickPriority(profile, this.rng.next());
    const iso = new Date(atMs).toISOString();
    const incident: Incident = {
      id: `inc-${(++this.seq).toString(36).padStart(6, '0')}`,
      type,
      priority,
      status: 'dispatched',
      cityId: city.id,
      state: city.state,
      ...scatterAround(city, this.sigmas[cityIdx] as number, this.rng),
      address: syntheticAddress(this.rng),
      description: this.rng.pick(profile.descriptions),
      unitsAssigned: profile.minUnits + (priority === 1 ? this.rng.int(1, 2) : this.rng.int(0, 1)),
      createdAt: iso,
      updatedAt: iso,
    };
    const dispatchSec = clamp(this.rng.logNormal(profile.dispatchMedianSec, 0.45), 15, 900);
    const onSceneSec = clamp(this.rng.logNormal(profile.onSceneMedianSec, 0.55), 20, 10_800);
    this.active.set(incident.id, { incident, nextAt: atMs + dispatchSec * 1000, onSceneSec });
    this.emit({ kind: 'created', incident });
  }

  private progressLifecycles(atMs: number): void {
    for (const [id, tracked] of this.active) {
      if (tracked.nextAt > atMs) continue;
      const iso = new Date(atMs).toISOString();
      if (tracked.incident.status === 'dispatched') {
        const extra = tracked.incident.priority <= 2 ? this.rng.int(0, 1) : 0;
        tracked.incident = {
          ...tracked.incident,
          status: 'on_scene',
          unitsAssigned: tracked.incident.unitsAssigned + extra,
          updatedAt: iso,
        };
        tracked.nextAt = atMs + tracked.onSceneSec * 1000;
        this.emit({ kind: 'updated', incident: tracked.incident });
      } else {
        this.active.delete(id);
        const incident: Incident = { ...tracked.incident, status: 'resolved', updatedAt: iso, resolvedAt: iso };
        this.emit({ kind: 'resolved', incident });
      }
    }
  }

  private emitHistory(fromMs: number, toMs: number): void {
    for (let start = fromMs; start < toMs; start += HISTORY_CHUNK_MS) {
      const mid = start + HISTORY_CHUNK_MS / 2;
      const total = this.computeWeights(mid);
      const scale = (this.opts.ratePerSec * (HISTORY_CHUNK_MS / 1000)) / this.totalPopulation;
      this.opts.cities.forEach((city, c) => {
        const counts = this.sampleHistoryCounts(c, scale * (this.cityWeights[c] as number) / this.citySum(c));
        if (counts) this.emit({ kind: 'history', cityId: city.id, at: mid, counts });
      });
      void total;
    }
  }

  /** Σ of type weights for one city (the per-city activity multiplier). */
  private citySum(cityIdx: number): number {
    const base = cityIdx * TYPE_COUNT;
    let sum = 0;
    for (let t = 0; t < TYPE_COUNT; t++) sum += this.typeWeights[base + t] as number;
    return sum;
  }

  private sampleHistoryCounts(cityIdx: number, cityMean: number): TypeCounts | null {
    const sum = this.citySum(cityIdx);
    const base = cityIdx * TYPE_COUNT;
    const counts = {} as TypeCounts;
    let any = false;
    INCIDENT_TYPES.forEach((type, t) => {
      const n = this.rng.poisson((cityMean * sum * (this.typeWeights[base + t] as number)) / sum);
      counts[type] = n;
      any ||= n > 0;
    });
    return any ? counts : null;
  }
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
