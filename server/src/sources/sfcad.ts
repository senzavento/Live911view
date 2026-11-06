import type { Incident, SourceStatus } from '@live911/shared';
import type { IncidentSource, SourceListener, SourceWindow, UnlocatedCall, Unsubscribe } from '../source';
import { utcToSfLocal } from '../time';
import { parseRow } from './row';

const DATASET = 'gnap-fj3t';
const WINDOW_MS = 48 * 3_600_000;
const MAX_BACKOFF_MS = 15 * 60_000;
const MAX_BODY_CHARS = 64_000_000;
const MAX_PAGES = 20;

/** Only the columns we use: the free-text `*_notes` columns are never even downloaded. */
const COLUMNS = [
  'cad_number', 'received_datetime', 'dispatch_datetime', 'onscene_datetime', 'close_datetime',
  'call_type_final_desc', 'call_type_original_desc', 'priority_final', 'priority_original', 'agency',
  'onview_flag', 'sensitive_call', 'intersection_id', 'intersection_name', 'intersection_point',
  'analysis_neighborhood', 'call_last_updated_at', 'data_as_of',
].join(',');

export interface SfCadLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

export interface SfCadOptions {
  /** poll period in seconds (the caller validates the 30 s minimum) */
  pollSec: number;
  appToken?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  now?: () => number;
  random?: () => number;
  timeoutMs?: number;
  pageSize?: number;
  /** re-download the window at least every N polls even if the metadata is unchanged */
  fullEvery?: number;
  log?: SfCadLogger;
}

/** An error whose message is safe to show to clients. */
export class SourceError extends Error {}

/** Delay before the next poll: the period on success, exponential with jitter (capped) on failure. */
export function nextDelayMs(pollMs: number, failures: number, random: () => number): number {
  if (failures === 0) return Math.round(pollMs * (0.9 + 0.2 * random()));
  const base = Math.min(pollMs * 2 ** failures, MAX_BACKOFF_MS);
  return Math.max(pollMs, Math.round(base * (0.5 + 0.5 * random())));
}

const isTimeout = (err: unknown): boolean => err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');

/** Maps any failure to a message without URLs, tokens or response bodies. */
function publicMessage(err: unknown): string {
  if (err instanceof SourceError) return err.message;
  return isTimeout(err) ? 'timeout' : 'network error';
}

/** Real data: DataSF "Law Enforcement Dispatched Calls for Service: Real-Time" (Socrata SODA). */
export class SfCadSource implements IncidentSource {
  private readonly listeners = new Set<SourceListener>();
  private readonly o: Required<Pick<SfCadOptions, 'baseUrl' | 'timeoutMs' | 'pageSize' | 'fullEvery'>> & SfCadOptions;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly random: () => number;
  private timer: NodeJS.Timeout | undefined;
  private stopCtl = new AbortController();
  private running = false;
  private stopped = false;
  private failures = 0;
  private lastRowsUpdatedAt: number | null = null;
  private skippedPolls = 0;
  private dataAsOfMs: number | null = null;
  private lastPollMs: number | null = null;
  private lastSuccessMs: number | null = null;
  private lastError: string | undefined;

  constructor(options: SfCadOptions) {
    this.o = { baseUrl: 'https://data.sf.gov', timeoutMs: 20_000, pageSize: 5000, fullEvery: 10, ...options };
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  subscribe(listener: SourceListener): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.stopped = false;
    this.stopCtl = new AbortController();
    this.schedule(0);
  }

  stop(): void {
    this.running = false;
    this.stopped = true;
    clearTimeout(this.timer);
    this.stopCtl.abort();
  }

  lastSuccessAt(): number | null {
    return this.lastSuccessMs;
  }

  status(): SourceStatus {
    const now = this.now();
    return {
      name: 'DataSF - Law Enforcement Dispatched Calls for Service: Real-Time',
      url: `${this.o.baseUrl}/d/${DATASET}`,
      license: 'PDDL',
      dataAsOf: this.dataAsOfMs === null ? null : new Date(this.dataAsOfMs).toISOString(),
      delaySec: this.dataAsOfMs === null ? null : Math.max(0, Math.round((now - this.dataAsOfMs) / 1000)),
      lastPollAt: this.lastPollMs === null ? null : new Date(this.lastPollMs).toISOString(),
      ok: this.lastError === undefined && this.lastSuccessMs !== null,
      ...(this.lastError === undefined ? {} : { lastError: this.lastError }),
    };
  }

  /** One poll cycle. Public so tests and tooling can drive it; it never throws. */
  async pollOnce(): Promise<void> {
    this.lastPollMs = this.now();
    try {
      const updatedAt = await this.readRowsUpdatedAt();
      const unchanged = updatedAt !== null && updatedAt === this.lastRowsUpdatedAt && this.skippedPolls < this.o.fullEvery;
      if (unchanged) {
        this.skippedPolls++;
      } else {
        const window = await this.fetchWindow();
        if (this.stopped) return;
        this.lastRowsUpdatedAt = updatedAt;
        this.skippedPolls = 0;
        this.emit(window);
      }
      this.failures = 0;
      this.lastError = undefined;
      this.lastSuccessMs = this.now();
    } catch (err) {
      this.failures++;
      this.lastError = publicMessage(err);
      this.o.log?.warn({ failures: this.failures, reason: this.lastError }, 'source poll failed');
    }
  }

  private schedule(delayMs: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      void this.pollOnce().finally(() => this.schedule(nextDelayMs(this.o.pollSec * 1000, this.failures, this.random)));
    }, delayMs);
    this.timer.unref();
  }

  private emit(window: SourceWindow): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(window);
      } catch (err) {
        this.o.log?.warn({ err }, 'source listener failed');
      }
    }
  }

  /** `rowsUpdatedAt` (epoch s) from the dataset metadata; null if unavailable (the data fetch then decides). */
  private async readRowsUpdatedAt(): Promise<number | null> {
    try {
      const meta = await this.getJson(`${this.o.baseUrl}/api/views/${DATASET}.json`);
      const value = typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>).rowsUpdatedAt : undefined;
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }

  private async fetchWindow(): Promise<SourceWindow> {
    const windowStartMs = this.now() - WINDOW_MS;
    const incidents = new Map<string, Incident>();
    const unlocated = new Map<string, UnlocatedCall>();
    let invalid = 0;
    let total = 0;
    let dataAsOf = this.dataAsOfMs;
    for (let page = 0; ; page++) {
      if (page >= MAX_PAGES) throw new SourceError('too many rows');
      const rows = await this.fetchPage(windowStartMs, page * this.o.pageSize);
      total += rows.length;
      for (const raw of rows) {
        const row = parseRow(raw);
        if (row.kind === 'invalid') {
          invalid++;
          continue;
        }
        if (row.dataAsOfMs !== undefined && (dataAsOf === null || row.dataAsOfMs > dataAsOf)) dataAsOf = row.dataAsOfMs;
        if (row.kind === 'incident') incidents.set(row.incident.id, newest(incidents.get(row.incident.id), row.incident));
        else unlocated.set(row.call.id, row.call);
      }
      if (rows.length < this.o.pageSize) break;
    }
    if (total > 0 && invalid === total) throw new SourceError('invalid data');
    // A call seen both ways keeps the safer reading.
    for (const id of unlocated.keys()) incidents.delete(id);
    this.dataAsOfMs = dataAsOf;
    this.o.log?.info({ rows: total, located: incidents.size, unlocated: unlocated.size, invalid }, 'source window loaded');
    return { kind: 'window', windowStartMs, incidents: [...incidents.values()], unlocated: [...unlocated.values()] };
  }

  private async fetchPage(windowStartMs: number, offset: number): Promise<unknown[]> {
    const url = new URL(`${this.o.baseUrl}/resource/${DATASET}.json`);
    url.searchParams.set('$select', COLUMNS);
    url.searchParams.set('$where', `received_datetime > '${utcToSfLocal(windowStartMs)}'`);
    url.searchParams.set('$order', 'received_datetime,cad_number');
    url.searchParams.set('$limit', String(this.o.pageSize));
    url.searchParams.set('$offset', String(offset));
    const body = await this.getJson(url.toString());
    if (!Array.isArray(body)) throw new SourceError('invalid response');
    return body;
  }

  private async getJson(url: string): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'Live911view/0.1 (public-data dashboard; DataSF reader)',
    };
    if (this.o.appToken) headers['X-App-Token'] = this.o.appToken;
    const signal = AbortSignal.any([AbortSignal.timeout(this.o.timeoutMs), this.stopCtl.signal]);
    const res = await this.fetchImpl(url, { headers, signal });
    if (!res.ok) throw new SourceError(`HTTP ${res.status}`);
    const body = await res.text();
    if (body.length > MAX_BODY_CHARS) throw new SourceError('response too large');
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new SourceError('invalid response');
    }
  }
}

/** On duplicate CAD numbers keep the most recently updated version. */
const newest = (a: Incident | undefined, b: Incident): Incident => (a && a.updatedAt > b.updatedAt ? a : b);
