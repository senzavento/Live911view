/**
 * Mondo finto SOLO per sviluppo/test dei pannelli: alimenta un vero Store tramite un
 * EventSource finto e risponde alle chiamate /api/* con un fetch finto. Non usato in produzione.
 */
import {
  INCIDENT_TYPES,
  type City,
  type CitySummary,
  type Incident,
  type IncidentStatus,
  type IncidentType,
  type NationalSummary,
  type Priority,
  type StateDetail,
  type StateSummary,
  type StreamEvent,
  type TimelinePoint,
  type TypeCounts,
} from '@live911/shared';
import type { Api } from '../api';
import { ApiError } from '../api';

const STATES: Array<[string, string, number]> = [
  ['TX', 'Texas', 30000000], ['CA', 'California', 39000000], ['NY', 'New York', 19500000], ['FL', 'Florida', 22200000],
  ['IL', 'Illinois', 12600000], ['WA', 'Washington', 7700000], ['AZ', 'Arizona', 7300000], ['CO', 'Colorado', 5800000],
  ['GA', 'Georgia', 10900000], ['MA', 'Massachusetts', 7000000], ['OH', 'Ohio', 11800000], ['NV', 'Nevada', 3100000],
];
const CITY_NAMES: Record<string, string[]> = {
  TX: ['Houston', 'Dallas', 'Austin'], CA: ['Los Angeles', 'San Diego', 'San Francisco'], NY: ['New York', 'Buffalo'],
  FL: ['Miami', 'Orlando', 'Tampa'], IL: ['Chicago', 'Springfield'], WA: ['Seattle', 'Spokane'], AZ: ['Phoenix', 'Tucson'],
  CO: ['Denver', 'Boulder'], GA: ['Atlanta', 'Savannah'], MA: ['Boston', 'Worcester'], OH: ['Columbus', 'Cleveland'], NV: ['Las Vegas', 'Reno'],
};
const STREETS = ['Main St', 'Oak Ave', 'Maple Dr', 'Elm St', 'Cedar Ln', 'Park Blvd', 'Lakeview Rd', 'Washington Ave'];
const DESC: Record<IncidentType, string[]> = {
  fire: ['Incendio in edificio residenziale', 'Fiamme da un magazzino', 'Incendio di sterpaglie'],
  medical: ['Malore con perdita di coscienza', 'Dolore toracico', 'Caduta con trauma'],
  police: ['Segnalazione di furto in corso', 'Lite domestica', 'Veicolo sospetto'],
  traffic: ['Tamponamento a catena', 'Veicolo ribaltato', 'Collisione ad un incrocio'],
  hazmat: ['Perdita di sostanza chimica', 'Odore di gas', 'Fuoriuscita di carburante'],
  rescue: ['Persona intrappolata', 'Escursionista disperso', 'Soccorso in acqua'],
};

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
  return { fire: 0, medical: 0, police: 0, traffic: 0, hazmat: 0, rescue: 0 };
}

export interface MockWorld {
  cities: City[];
  incidents: Map<string, Incident>;
  resolved: Map<string, Incident>;
  snapshot(): StreamEvent;
  summary(): NationalSummary;
  stateDetail(code: string): StateDetail | null;
  citySummary(id: string): CitySummary | null;
  step(): void;
  onEvent(fn: (e: StreamEvent) => void): () => void;
  start(ms?: number): void;
  stop(): void;
  /** forza un errore sulle prossime N chiamate fetch */
  failNext: number;
}

export function createMockWorld(seed = 7, initial = 240): MockWorld {
  const rand = rng(seed);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rand() * a.length)] as T;
  const cities: City[] = [];
  STATES.forEach(([code, , pop]) => {
    const names = CITY_NAMES[code] ?? [];
    names.forEach((name, i) => {
      cities.push({
        id: `${name.toLowerCase().replace(/\s+/g, '-')}-${code.toLowerCase()}`,
        name,
        state: code,
        lat: 30 + rand() * 15,
        lng: -120 + rand() * 40,
        population: Math.round((pop / names.length) * (0.5 + rand() * 0.5) * 0.4),
      });
    });
  });
  const incidents = new Map<string, Incident>();
  const resolved = new Map<string, Incident>();
  const listeners = new Set<(e: StreamEvent) => void>();
  let counter = 1000;
  let timer: ReturnType<typeof setInterval> | null = null;
  const history: TimelinePoint[] = [];
  const t0 = Date.now() - 59 * 60_000;
  for (let i = 0; i < 60; i++) {
    const byType = zero();
    for (const t of INCIDENT_TYPES) byType[t] = Math.floor(rand() * (t === 'medical' ? 9 : 5));
    history.push({ t: new Date(t0 + i * 60_000).toISOString(), byType, total: INCIDENT_TYPES.reduce((a, t) => a + byType[t], 0) });
  }

  function make(ageSec = 0): Incident {
    const city = pick(cities);
    const type = pick(INCIDENT_TYPES);
    const created = Date.now() - ageSec * 1000;
    const r = rand();
    const status: IncidentStatus = ageSec > 240 && r > 0.4 ? 'on_scene' : 'dispatched';
    const priority = (r < 0.12 ? 1 : r < 0.45 ? 2 : 3) as Priority;
    counter++;
    return {
      id: `inc-${counter}-${Math.floor(rand() * 1e6).toString(36)}`,
      type, priority, status, cityId: city.id, state: city.state,
      lat: city.lat, lng: city.lng,
      address: `${(1 + Math.floor(rand() * 98)) * 100} block of ${pick(STREETS)}`,
      description: pick(DESC[type]),
      unitsAssigned: 1 + Math.floor(rand() * 4),
      createdAt: new Date(created).toISOString(),
      updatedAt: new Date(created + 30_000).toISOString(),
    };
  }
  for (let i = 0; i < initial; i++) {
    const inc = make(Math.floor(rand() * 1500));
    incidents.set(inc.id, inc);
  }

  function emit(e: StreamEvent): void {
    for (const fn of listeners) fn(e);
  }

  function counts(filter: (i: Incident) => boolean): { byType: TypeCounts; active: number; critical: number } {
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

  function stateSummary(code: string, name: string, pop: number): StateSummary {
    const c = counts((i) => i.state === code);
    return { code, name, ...c, per100k: (c.active / pop) * 100_000 };
  }

  function summary(): NationalSummary {
    const all = counts(() => true);
    const timeline = history.map((p) => ({ ...p }));
    return {
      generatedAt: new Date().toISOString(),
      active: all.active,
      last24h: 9000 + all.active * 10,
      ratePerMin: 1.8 + rand(),
      critical: all.critical,
      avgResponseSec: 150 + Math.floor(rand() * 30),
      byType: all.byType,
      byState: STATES.map(([code, name, pop]) => stateSummary(code, name, pop)),
      timeline,
    };
  }

  function citySummary(id: string): CitySummary | null {
    const city = cities.find((c) => c.id === id);
    if (!city) return null;
    const c = counts((i) => i.cityId === id);
    return {
      city, active: c.active, critical: c.critical, last24h: 200 + c.active * 8, byType: c.byType,
      avgResponseSec: 120 + (id.length % 7) * 11,
      timeline: history.map((p, k) => {
        const byType = zero();
        for (const t of INCIDENT_TYPES) byType[t] = Math.floor((p.byType[t] * ((k + id.length) % 4)) / 4);
        return { t: p.t, byType, total: INCIDENT_TYPES.reduce((a, t) => a + byType[t], 0) };
      }),
    };
  }

  const world: MockWorld = {
    cities, incidents, resolved, failNext: 0,
    summary,
    snapshot: () => ({ event: 'snapshot', data: { incidents: [...incidents.values()], summary: summary() } }),
    citySummary,
    stateDetail(code) {
      const s = STATES.find((x) => x[0] === code);
      if (!s) return null;
      return {
        ...stateSummary(s[0], s[1], s[2]),
        cities: cities.filter((c) => c.state === code).map((c) => citySummary(c.id) as CitySummary),
      };
    },
    step() {
      const n = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        const inc = make();
        incidents.set(inc.id, inc);
        emit({ event: 'incident.created', data: inc });
      }
      for (const inc of [...incidents.values()]) {
        const r = rand();
        if (r < 0.02) {
          const done: Incident = { ...inc, status: 'resolved', resolvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          incidents.delete(inc.id);
          resolved.set(done.id, done);
          emit({ event: 'incident.resolved', data: done });
        } else if (r < 0.05 && inc.status === 'dispatched') {
          const up: Incident = { ...inc, status: 'on_scene', updatedAt: new Date().toISOString() };
          incidents.set(up.id, up);
          emit({ event: 'incident.updated', data: up });
        }
      }
      emit({ event: 'summary', data: summary() });
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
  if ((m = /^\/api\/states\/([^/]+)$/.exec(p))) {
    const d = world.stateDetail(decodeURIComponent(m[1] ?? '').toUpperCase());
    return d ? json(d) : json({ error: 'Stato sconosciuto' }, 404);
  }
  if ((m = /^\/api\/cities\/([^/]+)$/.exec(p))) {
    const d = world.citySummary(decodeURIComponent(m[1] ?? ''));
    return d ? json(d) : json({ error: 'Città sconosciuta' }, 404);
  }
  if (p === '/api/incidents') {
    const cityId = url.searchParams.get('cityId');
    return json([...world.incidents.values()].filter((i) => !cityId || i.cityId === cityId));
  }
  if ((m = /^\/api\/incidents\/([^/]+)$/.exec(p))) {
    const id = decodeURIComponent(m[1] ?? '');
    const inc = world.incidents.get(id) ?? world.resolved.get(id);
    return inc ? json(inc) : json({ error: 'Incidente sconosciuto' }, 404);
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
    state: (c, s) => get(`/api/states/${c}`, s),
    city: (id, s) => get(`/api/cities/${id}`, s),
    cityIncidents: (id, s) => get(`/api/incidents?cityId=${id}`, s),
    incident: (id, s) => get(`/api/incidents/${id}`, s),
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
