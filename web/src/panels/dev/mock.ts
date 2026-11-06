/**
 * Mondo finto SOLO per sviluppo/test dei pannelli: alimenta un vero Store tramite un
 * EventSource finto e risponde alle chiamate /api/* con un fetch finto. Non usato in produzione.
 * Modello dati: San Francisco (quartieri, incroci, chiamate) come da docs/CONTRACT.md.
 */
import {
  INCIDENT_TYPES,
  type AreaDetail,
  type AreaSummary,
  type CitySummary,
  type Incident,
  type IncidentStatus,
  type IncidentType,
  type IntersectionDetail,
  type IntersectionSummary,
  type Priority,
  type SourceStatus,
  type StreamEvent,
  type TimelinePoint,
  type TypeCounts,
} from '@live911/shared';
import type { Api } from '../api';
import { ApiError } from '../api';

interface AreaDef {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** peso relativo del volume di chiamate */
  w: number;
  streets: Array<[string, string]>;
}

const AREAS: AreaDef[] = [
  { id: 'mission', name: 'Mission', lat: 37.7599, lng: -122.4148, w: 12, streets: [['MISSION ST', '16TH ST'], ['MISSION ST', '24TH ST'], ['VALENCIA ST', '18TH ST'], ['FOLSOM ST', '20TH ST'], ['MINNA ST', 'RUSS ST'], ['SOUTH VAN NESS AVE', '17TH ST']] },
  { id: 'tenderloin', name: 'Tenderloin', lat: 37.7847, lng: -122.4145, w: 14, streets: [['TURK ST', 'JONES ST'], ['EDDY ST', 'LEAVENWORTH ST'], ['ELLIS ST', 'HYDE ST'], ['MCALLISTER ST', 'LARKIN ST'], ['GOLDEN GATE AVE', 'TAYLOR ST']] },
  { id: 'south-of-market', name: 'South of Market', lat: 37.7785, lng: -122.4056, w: 13, streets: [['6TH ST', 'MARKET ST'], ['7TH ST', 'FOLSOM ST'], ['HARRISON ST', '5TH ST'], ['BRYANT ST', '4TH ST'], ['TOWNSEND ST', '3RD ST']] },
  { id: 'bayview-hunters-point', name: 'Bayview Hunters Point', lat: 37.7298, lng: -122.3912, w: 6, streets: [['3RD ST', 'PALOU AVE'], ['BAYSHORE BLVD', 'SILVER AVE'], ['KEITH ST', 'OAKDALE AVE']] },
  { id: 'financial-district-south-beach', name: 'Financial District/South Beach', lat: 37.7916, lng: -122.3987, w: 8, streets: [['MARKET ST', 'FREMONT ST'], ['EMBARCADERO', 'BRANNAN ST'], ['KEARNY ST', 'CALIFORNIA ST'], ['2ND ST', 'KING ST']] },
  { id: 'sunset-parkside', name: 'Sunset/Parkside', lat: 37.7451, lng: -122.4888, w: 4, streets: [['IRVING ST', '19TH AVE'], ['JUDAH ST', '30TH AVE'], ['TARAVAL ST', '22ND AVE']] },
  { id: 'castro-upper-market', name: 'Castro/Upper Market', lat: 37.7609, lng: -122.4350, w: 4, streets: [['CASTRO ST', '18TH ST'], ['MARKET ST', 'SANCHEZ ST'], ['16TH ST', 'MISSION ST']] },
  { id: 'haight-ashbury', name: 'Haight Ashbury', lat: 37.7692, lng: -122.4481, w: 3, streets: [['HAIGHT ST', 'ASHBURY ST'], ['HAIGHT ST', 'FILLMORE ST']] },
  { id: 'nob-hill', name: 'Nob Hill', lat: 37.7930, lng: -122.4161, w: 4, streets: [['CALIFORNIA ST', 'POLK ST'], ['POLK ST', 'SUTTER ST'], ['LEAVENWORTH ST', 'BUSH ST']] },
  { id: 'chinatown', name: 'Chinatown', lat: 37.7941, lng: -122.4078, w: 3, streets: [['GRANT AVE', 'CLAY ST'], ['STOCKTON ST', 'PACIFIC AVE']] },
  { id: 'marina', name: 'Marina', lat: 37.8037, lng: -122.4368, w: 3, streets: [['CHESTNUT ST', 'FILLMORE ST'], ['LOMBARD ST', 'WEBSTER ST']] },
  { id: 'outer-richmond', name: 'Outer Richmond', lat: 37.7777, lng: -122.4930, w: 2, streets: [['GEARY BLVD', '25TH AVE'], ['BALBOA ST', '38TH AVE']] },
  { id: 'excelsior', name: 'Excelsior', lat: 37.7246, lng: -122.4310, w: 3, streets: [['MISSION ST', 'EXCELSIOR AVE'], ['MISSION ST', 'FRANCE AVE']] },
];

/** Descrizioni in stile CAD per categoria (testo della fonte, non affidabile: mostrato solo come testo). */
const DESC: Record<IncidentType, string[]> = {
  violent: ['ASSAULT / BATTERY', 'ROBBERY', 'PERSON WITH A KNIFE', 'SHOTS FIRED'],
  property: ['PETTY THEFT', 'BURGLARY', 'AUTO BOOST', 'VANDALISM', 'STOLEN VEHICLE'],
  traffic: ['VEHICLE ACCIDENT', 'TRAFFIC HAZARD', 'HIT AND RUN', 'INJURY VEH ACCIDENT'],
  disturbance: ['SUSPICIOUS PERSON', 'FIGHT NO WEAPON', 'TRESPASSER', 'NOISE NUISANCE', 'HOMELESS COMPLAINT'],
  welfare: ['WELL BEING CHECK', 'AIDED CASE'],
  alarm: ['AUDIBLE ALARM', 'SILENT ALARM'],
  proactive: ['TRAFFIC STOP', 'PASSING CALL', 'STANDBY', 'TRAF VIOLATION CITE', 'MEET W/ CITIZEN'],
  other: ['UNKNOWN CALL TYPE'],
};
const TYPE_W: Record<IncidentType, number> = { violent: 6, property: 16, traffic: 9, disturbance: 20, welfare: 9, alarm: 9, proactive: 28, other: 3 };
const AGENCIES: Array<[string, number]> = [['Police', 90], ['Municipal Transportation Agency', 4], ['Sheriff', 3], ['HEART', 3]];

/** Profilo orario (0-23, ora SF) del volume di chiamate. */
const DIURNAL = [0.55, 0.42, 0.34, 0.28, 0.25, 0.3, 0.42, 0.6, 0.75, 0.85, 0.9, 0.95, 1, 1, 1, 1.02, 1.05, 1.1, 1.12, 1.1, 1, 0.9, 0.8, 0.65];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function zero(): TypeCounts {
  return { violent: 0, property: 0, traffic: 0, disturbance: 0, welfare: 0, alarm: 0, proactive: 0, other: 0 };
}

export type SourceMode = 'ok' | 'error' | 'stale';

export interface MockWorld {
  incidents: Map<string, Incident>;
  resolved: Map<string, Incident>;
  snapshot(): StreamEvent;
  summary(): CitySummary;
  areaDetail(id: string): AreaDetail | null;
  intersectionDetail(id: string): IntersectionDetail | null;
  step(): void;
  /** risolve una chiamata emettendo incident.resolved */
  resolve(id: string): void;
  onEvent(fn: (e: StreamEvent) => void): () => void;
  start(ms?: number): void;
  stop(): void;
  /** forza un errore sulle prossime N chiamate fetch */
  failNext: number;
  /** scenario della sorgente: ok (ritardo ~15 min), error (poll fallito), stale (ritardo > 30 min) */
  sourceMode: SourceMode;
}

interface IxDef {
  id: string;
  name: string;
  areaId: string;
  lat: number;
  lng: number;
}

export function createMockWorld(seed = 7, initial = 240): MockWorld {
  const rand = rng(seed);
  const pickW = <T>(items: ReadonlyArray<[T, number]>): T => {
    const total = items.reduce((a, [, w]) => a + w, 0);
    let r = rand() * total;
    for (const [v, w] of items) if ((r -= w) <= 0) return v;
    return (items[0] as [T, number])[0];
  };
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rand() * a.length)] as T;

  const ixs: IxDef[] = [];
  const areaOf = new Map<string, AreaDef>();
  for (const a of AREAS) {
    areaOf.set(a.id, a);
    a.streets.forEach(([s1, s2], i) => {
      ixs.push({
        id: `${a.id}-${i}`,
        name: `${s1} \\ ${s2}`,
        areaId: a.id,
        lat: a.lat + (rand() - 0.5) * 0.012,
        lng: a.lng + (rand() - 0.5) * 0.012,
      });
    });
  }
  const ixById = new Map(ixs.map((x) => [x.id, x]));
  const pickIx = (): IxDef => {
    const a = pickW(AREAS.map((x) => [x, x.w] as [AreaDef, number]));
    return pick(ixs.filter((x) => x.areaId === a.id));
  };

  const incidents = new Map<string, Incident>();
  const resolved = new Map<string, Incident>();
  const listeners = new Set<(e: StreamEvent) => void>();
  let counter = 261100000;
  let timer: ReturnType<typeof setInterval> | null = null;

  function make(ageSec: number, forceResolved = false): Incident {
    const ix = pickIx();
    const area = areaOf.get(ix.areaId) as AreaDef;
    const type = pickW(INCIDENT_TYPES.map((t) => [t, TYPE_W[t]] as [IncidentType, number]));
    const r = rand();
    const priority = (type === 'violent' ? (r < 0.5 ? 1 : 2) : type === 'proactive' ? 3 : r < 0.06 ? 1 : r < 0.4 ? 2 : 3) as Priority;
    const officerInitiated = type === 'proactive' ? rand() < 0.85 : rand() < 0.12;
    const created = Date.now() - ageSec * 1000;
    const dispatchLag = officerInitiated ? 0 : Math.floor(40 + rand() * 360);
    const dispatchedAt = created + dispatchLag * 1000;
    const onSceneLag = 120 + rand() * 900;
    const onSceneAt = ageSec > dispatchLag + onSceneLag ? dispatchedAt + onSceneLag * 1000 : null;
    const done = forceResolved || (ageSec > 1500 && rand() < 0.5);
    const status: IncidentStatus = done ? 'resolved' : onSceneAt ? 'on_scene' : 'dispatched';
    const resolvedAt = done ? Math.min(Date.now(), (onSceneAt ?? dispatchedAt) + (300 + rand() * 2400) * 1000) : null;
    counter += 1 + Math.floor(rand() * 40);
    return {
      id: String(counter),
      type,
      priority,
      status,
      areaId: area.id,
      areaName: area.name,
      intersectionId: ix.id,
      address: ix.name,
      lat: ix.lat,
      lng: ix.lng,
      description: pick(DESC[type]),
      agency: pickW(AGENCIES),
      officerInitiated,
      createdAt: new Date(created).toISOString(),
      dispatchedAt: new Date(dispatchedAt).toISOString(),
      ...(onSceneAt ? { onSceneAt: new Date(onSceneAt).toISOString() } : {}),
      updatedAt: new Date(resolvedAt ?? onSceneAt ?? dispatchedAt).toISOString(),
      ...(resolvedAt ? { resolvedAt: new Date(resolvedAt).toISOString() } : {}),
    };
  }

  for (let i = 0; i < initial; i++) {
    const inc = make(Math.floor(rand() * 3 * 3600));
    if (inc.status === 'resolved') resolved.set(inc.id, inc);
    else incidents.set(inc.id, inc);
  }
  for (let i = 0; i < Math.round(initial * 1.2); i++) {
    const inc = make(3600 + Math.floor(rand() * 44 * 3600), true);
    resolved.set(inc.id, inc);
  }

  function emit(e: StreamEvent): void {
    for (const fn of listeners) fn(e);
  }

  function activeCounts(filter: (i: Incident) => boolean): { byType: TypeCounts; active: number; critical: number } {
    const byType = zero();
    let critical = 0;
    let active = 0;
    for (const i of incidents.values()) {
      if (!filter(i)) continue;
      byType[i.type]++;
      active++;
      if (i.priority === 1) critical++;
    }
    return { byType, active, critical };
  }

  function last24hOf(filter: (i: Incident) => boolean): number {
    const t0 = Date.now() - 24 * 3600_000;
    let n = 0;
    for (const m of [incidents, resolved]) for (const i of m.values()) if (filter(i) && Date.parse(i.createdAt) >= t0) n++;
    return n;
  }

  /** 24 bucket orari dal più vecchio; il volume segue il profilo diurno e la quota del quartiere. */
  function timeline(share: number): TimelinePoint[] {
    const now = new Date();
    const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()) - 23 * 3600_000;
    const sumW = INCIDENT_TYPES.reduce((a, t) => a + TYPE_W[t], 0);
    return Array.from({ length: 24 }, (_, k) => {
      const t = start + k * 3600_000;
      const hourSf = (new Date(t).getUTCHours() + 24 - 8) % 24;
      const byType = zero();
      let total = 0;
      for (const type of INCIDENT_TYPES) {
        const v = Math.max(0, Math.round(((130 * share * (DIURNAL[hourSf] ?? 1) * TYPE_W[type]) / sumW) * (0.75 + rand() * 0.5)));
        byType[type] = v;
        total += v;
      }
      return { t: new Date(t).toISOString(), total, byType };
    });
  }

  const tl = timeline(1);
  const areaTl = new Map(AREAS.map((a) => [a.id, timeline(a.w / 70)]));

  function source(world: MockWorld): SourceStatus {
    const base = { name: 'DataSF', url: 'https://data.sf.gov/resource/gnap-fj3t.json', license: 'PDDL' };
    const now = Date.now();
    if (world.sourceMode === 'stale') {
      return { ...base, dataAsOf: new Date(now - 52 * 60_000).toISOString(), delaySec: 52 * 60, lastPollAt: new Date(now - 30_000).toISOString(), ok: true };
    }
    if (world.sourceMode === 'error') {
      return {
        ...base,
        dataAsOf: new Date(now - 41 * 60_000).toISOString(),
        delaySec: 41 * 60,
        lastPollAt: new Date(now - 20_000).toISOString(),
        ok: false,
        lastError: 'HTTP 503 da data.sf.gov (riprovo con backoff)',
      };
    }
    return { ...base, dataAsOf: new Date(now - 15 * 60_000).toISOString(), delaySec: 15 * 60, lastPollAt: new Date(now - 40_000).toISOString(), ok: true };
  }

  function areaSummary(a: AreaDef): AreaSummary {
    const c = activeCounts((i) => i.areaId === a.id);
    return { id: a.id, name: a.name, lat: a.lat, lng: a.lng, ...c, last24h: last24hOf((i) => i.areaId === a.id) };
  }
  function ixSummary(x: IxDef): IntersectionSummary {
    const c = activeCounts((i) => i.intersectionId === x.id);
    return { id: x.id, name: x.name, areaId: x.areaId, lat: x.lat, lng: x.lng, ...c, last24h: last24hOf((i) => i.intersectionId === x.id) };
  }

  const world: MockWorld = {
    incidents,
    resolved,
    failNext: 0,
    sourceMode: 'ok',
    snapshot: () => ({ event: 'snapshot', data: { incidents: [...incidents.values()], summary: world.summary() } }),
    summary() {
      const all = activeCounts(() => true);
      const unlocated = Math.round(last24hOf(() => true) * 0.45);
      const last24h = last24hOf(() => true) + unlocated;
      return {
        generatedAt: new Date().toISOString(),
        active: all.active,
        last24h,
        critical: all.critical,
        byType: all.byType,
        ratePerHour: 140 + Math.floor(rand() * 20),
        medianCriticalDispatchSec: world.sourceMode === 'error' ? null : 214 + Math.floor(rand() * 20),
        unlocated24h: unlocated,
        timeline: tl,
        byArea: AREAS.map(areaSummary),
        source: source(world),
      };
    },
    areaDetail(id) {
      const a = areaOf.get(id);
      if (!a) return null;
      return {
        ...areaSummary(a),
        medianCriticalDispatchSec: 190 + a.w * 7,
        timeline: areaTl.get(id) ?? [],
        intersections: ixs.filter((x) => x.areaId === id).map(ixSummary),
      };
    },
    intersectionDetail(id) {
      const x = ixById.get(id);
      if (!x) return null;
      const list = [...incidents.values(), ...resolved.values()]
        .filter((i) => i.intersectionId === id)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 100);
      return { ...ixSummary(x), incidents: list };
    },
    resolve(id) {
      const inc = incidents.get(id);
      if (!inc) return;
      const now = new Date().toISOString();
      const done: Incident = { ...inc, status: 'resolved', resolvedAt: now, updatedAt: now };
      incidents.delete(id);
      resolved.set(id, done);
      emit({ event: 'incident.resolved', data: done });
    },
    step() {
      const n = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        const inc = make(0);
        if (inc.status === 'resolved') continue;
        incidents.set(inc.id, inc);
        emit({ event: 'incident.created', data: inc });
      }
      for (const inc of [...incidents.values()]) {
        const r = rand();
        if (r < 0.02) {
          world.resolve(inc.id);
        } else if (r < 0.05 && inc.status === 'dispatched') {
          const now = new Date().toISOString();
          const up: Incident = { ...inc, status: 'on_scene', onSceneAt: now, updatedAt: now };
          incidents.set(up.id, up);
          emit({ event: 'incident.updated', data: up });
        }
      }
      emit({ event: 'summary', data: world.summary() });
    },
    onEvent(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    start(ms = 2000) {
      timer = setInterval(() => world.step(), ms);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
  return world;
}

type Handler = (ev: { data: string }) => void;

/** EventSource finto: consegna snapshot e stream del mondo al vero Store. */
export function installFakeEventSource(world: MockWorld): () => void {
  const g = globalThis as unknown as { EventSource: unknown };
  const prev = g.EventSource;
  class FakeEventSource {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;
    readyState = 0;
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private handlers = new Map<string, Handler[]>();
    private off: () => void;
    constructor(_url: string) {
      this.off = world.onEvent((e) => this.dispatch(e));
      setTimeout(() => {
        if (this.readyState === 2) return;
        this.readyState = 1;
        this.onopen?.();
        this.dispatch(world.snapshot());
      }, 20);
    }
    addEventListener(name: string, fn: Handler): void {
      this.handlers.set(name, [...(this.handlers.get(name) ?? []), fn]);
    }
    close(): void {
      this.readyState = 2;
      this.off();
    }
    private dispatch(e: StreamEvent): void {
      for (const fn of this.handlers.get(e.event) ?? []) fn({ data: JSON.stringify(e.data) });
    }
  }
  g.EventSource = FakeEventSource;
  return () => {
    g.EventSource = prev;
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Risponde come il server del contratto (docs/CONTRACT.md). */
export function mockFetch(world: MockWorld, latencyMs = 80): (input: string, init?: { signal?: AbortSignal }) => Promise<Response> {
  return (input, init) =>
    new Promise<Response>((resolve, reject) => {
      const signal = init?.signal;
      const t = setTimeout(() => {
        if (world.failNext > 0) {
          world.failNext--;
          resolve(json({ error: 'Errore interno simulato' }, 500));
          return;
        }
        resolve(route(world, input));
      }, latencyMs);
      signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
}

function route(world: MockWorld, input: string): Response {
  const url = new URL(input, 'http://localhost');
  const p = url.pathname;
  let m: RegExpExecArray | null;
  if (p === '/api/summary') return json(world.summary());
  if ((m = /^\/api\/areas\/([^/]+)$/.exec(p))) {
    const d = world.areaDetail(decodeURIComponent(m[1] ?? ''));
    return d ? json(d) : json({ error: 'Quartiere sconosciuto' }, 404);
  }
  if ((m = /^\/api\/intersections\/([^/]+)$/.exec(p))) {
    const d = world.intersectionDetail(decodeURIComponent(m[1] ?? ''));
    return d ? json(d) : json({ error: 'Incrocio sconosciuto' }, 404);
  }
  if ((m = /^\/api\/incidents\/([^/]+)$/.exec(p))) {
    const id = decodeURIComponent(m[1] ?? '');
    const inc = world.incidents.get(id) ?? world.resolved.get(id);
    return inc ? json(inc) : json({ error: 'Chiamata sconosciuta' }, 404);
  }
  return json({ error: 'Non trovato' }, 404);
}

/** Client Api diretto sul mondo finto (per test senza fetch globale). */
export function mockApi(world: MockWorld, latencyMs = 0): Api {
  const f = mockFetch(world, latencyMs);
  const get = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
    const res = await f(path, { signal });
    const body: unknown = await res.json();
    if (!res.ok) throw new ApiError(String((body as { error?: string }).error ?? 'Errore'), res.status);
    return body as T;
  };
  return {
    area: (id, s) => get(`/api/areas/${encodeURIComponent(id)}`, s),
    intersection: (id, s) => get(`/api/intersections/${encodeURIComponent(id)}`, s),
    incident: (id, s) => get(`/api/incidents/${encodeURIComponent(id)}`, s),
  };
}

export function installMock(world: MockWorld, latencyMs = 80): () => void {
  const restoreES = installFakeEventSource(world);
  const prevFetch = window.fetch;
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    mockFetch(world, latencyMs)(String(input), { signal: init?.signal ?? undefined })) as typeof fetch;
  return () => {
    restoreES();
    window.fetch = prevFetch;
  };
}
