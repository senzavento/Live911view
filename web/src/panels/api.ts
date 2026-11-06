import type { CitySummary, Incident, StateDetail } from '@live911/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface Api {
  state(code: string, signal?: AbortSignal): Promise<StateDetail>;
  city(id: string, signal?: AbortSignal): Promise<CitySummary>;
  cityIncidents(id: string, signal?: AbortSignal): Promise<Incident[]>;
  incident(id: string, signal?: AbortSignal): Promise<Incident>;
}

type FetchFn = (input: string, init?: { signal?: AbortSignal }) => Promise<Response>;

/** Client REST con cache breve (TTL) e deduplicazione delle richieste in volo per path. */
export function createApi(fetchFn: FetchFn = (i, o) => fetch(i, o), ttlMs = 4000, now: () => number = Date.now): Api {
  const cache = new Map<string, { at: number; data: unknown }>();

  async function getJson<T>(path: string, signal?: AbortSignal, ttl = ttlMs): Promise<T> {
    const hit = cache.get(path);
    if (hit && now() - hit.at < ttl) return hit.data as T;
    let res: Response;
    try {
      res = await fetchFn(path, { signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      throw new ApiError('Server non raggiungibile', 0);
    }
    if (!res.ok) {
      let msg = `Errore ${res.status}`;
      try {
        const body = (await res.json()) as { error?: unknown };
        if (typeof body.error === 'string') msg = body.error;
      } catch {
        /* corpo non JSON */
      }
      throw new ApiError(msg, res.status);
    }
    const data = (await res.json()) as T;
    cache.set(path, { at: now(), data });
    if (cache.size > 100) {
      const first = cache.keys().next().value;
      if (first !== undefined) cache.delete(first);
    }
    return data;
  }

  const enc = encodeURIComponent;
  return {
    state: (code, s) => getJson<StateDetail>(`/api/states/${enc(code)}`, s),
    city: (id, s) => getJson<CitySummary>(`/api/cities/${enc(id)}`, s),
    cityIncidents: (id, s) => getJson<Incident[]>(`/api/incidents?cityId=${enc(id)}&limit=500`, s),
    // niente cache: lo stato dell'incidente cambia
    incident: (id, s) => getJson<Incident>(`/api/incidents/${enc(id)}`, s, 0),
  };
}

export type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T; refreshing: boolean }
  | { status: 'error'; message: string; notFound: boolean };

/**
 * Carica una risorsa con AbortController, ricarica periodica silenziosa (stale-while-revalidate)
 * e retry. `destroy()` annulla richieste in volo e timer.
 */
export class Resource<T> {
  state: LoadState<T> = { status: 'idle' };
  private ctrl: AbortController | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private dead = false;

  constructor(
    private readonly fetcher: (signal: AbortSignal) => Promise<T>,
    private readonly onChange: (s: LoadState<T>) => void,
    private readonly refreshMs = 0,
  ) {}

  start(): void {
    void this.load(false);
    if (this.refreshMs > 0) this.timer = setInterval(() => void this.load(true), this.refreshMs);
  }

  retry(): void {
    void this.load(false);
  }

  async load(silent: boolean): Promise<void> {
    if (this.dead) return;
    this.ctrl?.abort();
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    const prev = this.state;
    if (!silent || prev.status !== 'ready') this.set({ status: 'loading' });
    else this.set({ ...prev, refreshing: true });
    try {
      const data = await this.fetcher(ctrl.signal);
      if (this.dead || ctrl.signal.aborted) return;
      this.set({ status: 'ready', data, refreshing: false });
    } catch (err) {
      if (this.dead || ctrl.signal.aborted) return;
      // errore su refresh silenzioso: mantieni i dati precedenti
      if (silent && prev.status === 'ready') {
        this.set({ ...prev, refreshing: false });
        return;
      }
      const notFound = err instanceof ApiError && err.status === 404;
      this.set({ status: 'error', message: err instanceof Error ? err.message : 'Errore sconosciuto', notFound });
    }
  }

  private set(s: LoadState<T>): void {
    this.state = s;
    this.onChange(s);
  }

  destroy(): void {
    this.dead = true;
    this.ctrl?.abort();
    this.ctrl = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
