import type { Incident, IncidentStatus, IncidentType } from '@live911/shared';
import type { SourceWindow, UnlocatedCall } from './source';

export const WINDOW_MS = 48 * 3_600_000;

export interface IncidentFilter {
  type?: IncidentType;
  areaId?: string;
  intersectionId?: string;
  status?: IncidentStatus;
}

export type IncidentChange =
  | { event: 'incident.created'; data: Incident }
  | { event: 'incident.updated'; data: Incident }
  | { event: 'incident.resolved'; data: Incident };

export interface AreaRecord {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

const sameIncident = (a: Incident, b: Incident): boolean => JSON.stringify(a) === JSON.stringify(b);
const round5 = (n: number): number => Math.round(n * 1e5) / 1e5;

const matches = (i: Incident, f: IncidentFilter): boolean =>
  (!f.type || i.type === f.type) &&
  (!f.areaId || i.areaId === f.areaId) &&
  (!f.intersectionId || i.intersectionId === f.intersectionId) &&
  (f.status ? i.status === f.status : i.status !== 'resolved');

/**
 * The whole 48 h window (active and resolved located calls) plus the identities of unlocated ones.
 * `sync` replaces the window with the source's latest view and reports what changed.
 */
export class IncidentStore {
  private readonly incidents = new Map<string, Incident>();
  private readonly unlocatedCalls = new Map<string, UnlocatedCall>();
  private readonly areaRegistry = new Map<string, AreaRecord>();
  private loaded = false;
  /** bumped on every mutation: lets readers cache derived data */
  version = 0;

  constructor(private readonly clock: () => number = Date.now) {}

  get isLoaded(): boolean {
    return this.loaded;
  }

  /** Applies a window and returns created/updated/resolved changes (none on the first load: the snapshot covers it). */
  sync(window: SourceWindow): IncidentChange[] {
    const changes: IncidentChange[] = [];
    const seen = new Set<string>();
    const nonEmpty = window.incidents.length + window.unlocated.length > 0;
    for (const next of window.incidents) {
      seen.add(next.id);
      const change = this.upsert(next);
      if (change && this.loaded) changes.push(change);
    }
    if (nonEmpty) this.dropVanished(window.windowStartMs, seen, changes);
    this.unlocatedCalls.clear();
    for (const call of window.unlocated) this.unlocatedCalls.set(call.id, call);
    this.prune();
    this.refreshAreas();
    this.loaded = true;
    this.version++;
    return changes;
  }

  /** Drops calls older than the window. Cheap enough to run on every summary tick. */
  prune(): void {
    const cutoff = this.clock() - WINDOW_MS;
    let removed = false;
    for (const [id, i] of this.incidents) {
      if (Date.parse(i.createdAt) <= cutoff) {
        this.incidents.delete(id);
        removed = true;
      }
    }
    for (const [id, c] of this.unlocatedCalls) {
      if (c.receivedMs <= cutoff) {
        this.unlocatedCalls.delete(id);
        removed = true;
      }
    }
    if (removed) this.version++;
  }

  get(id: string): Incident | undefined {
    return this.incidents.get(id);
  }

  all(): IterableIterator<Incident> {
    return this.incidents.values();
  }

  unlocated(): IterableIterator<UnlocatedCall> {
    return this.unlocatedCalls.values();
  }

  activeIncidents(): Incident[] {
    return [...this.incidents.values()].filter((i) => i.status !== 'resolved');
  }

  areas(): AreaRecord[] {
    return [...this.areaRegistry.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  area(id: string): AreaRecord | undefined {
    return this.areaRegistry.get(id);
  }

  /** Newest first. Without `status`, only unresolved calls are returned. */
  query(filter: IncidentFilter, limit: number): Incident[] {
    const out: Incident[] = [];
    for (const i of this.incidents.values()) if (matches(i, filter)) out.push(i);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1));
    return out.slice(0, limit);
  }

  private upsert(next: Incident): IncidentChange | undefined {
    const prev = this.incidents.get(next.id);
    this.incidents.set(next.id, next);
    if (!prev) return next.status === 'resolved' ? undefined : { event: 'incident.created', data: next };
    if (sameIncident(prev, next)) return undefined;
    if (prev.status !== 'resolved' && next.status === 'resolved') return { event: 'incident.resolved', data: next };
    return next.status === 'resolved' ? undefined : { event: 'incident.updated', data: next };
  }

  /** Calls inside the fetched range that the source no longer lists are gone: close them rather than leave them active. */
  private dropVanished(windowStartMs: number, seen: Set<string>, changes: IncidentChange[]): void {
    const nowIso = new Date(this.clock()).toISOString();
    for (const [id, i] of this.incidents) {
      if (seen.has(id) || Date.parse(i.createdAt) <= windowStartMs) continue;
      this.incidents.delete(id);
      if (i.status !== 'resolved' && this.loaded) {
        changes.push({ event: 'incident.resolved', data: { ...i, status: 'resolved', resolvedAt: nowIso, updatedAt: nowIso } });
      }
    }
  }

  /** Areas are never forgotten once seen (stable ids); centroids follow the current window. */
  private refreshAreas(): void {
    const sums = new Map<string, { lat: number; lng: number; n: number; name: string }>();
    for (const i of this.incidents.values()) {
      const s = sums.get(i.areaId) ?? { lat: 0, lng: 0, n: 0, name: i.areaName };
      s.lat += i.lat;
      s.lng += i.lng;
      s.n++;
      sums.set(i.areaId, s);
    }
    for (const [id, s] of sums) {
      this.areaRegistry.set(id, { id, name: s.name, lat: round5(s.lat / s.n), lng: round5(s.lng / s.n) });
    }
  }
}
