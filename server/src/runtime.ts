import { Analytics } from './analytics';
import type { IncidentSource, SourceWindow } from './source';
import { IncidentStore } from './store';
import { DEFAULT_STREAM_OPTIONS, StreamHub, type StreamOptions } from './stream';

/** /api/health reports ok=false when no poll has succeeded for this long. */
export const STALE_AFTER_MS = 15 * 60_000;

export interface RuntimeOptions {
  source: IncidentSource;
  clock?: () => number;
  stream?: Partial<StreamOptions>;
  onError?: (err: unknown) => void;
}

export interface Runtime {
  source: IncidentSource;
  store: IncidentStore;
  analytics: Analytics;
  hub: StreamHub;
  clock: () => number;
  startedAt: number;
  /** false until a poll succeeded, and again when the last success is older than STALE_AFTER_MS */
  isHealthy(): boolean;
  start(): void;
  stop(): void;
}

/** Wires source -> store -> SSE hub, with analytics reading the store. */
export function createRuntime(opts: RuntimeOptions): Runtime {
  const { source } = opts;
  const clock = opts.clock ?? Date.now;
  const store = new IncidentStore(clock);
  const analytics = new Analytics(store, clock, () => source.status());
  const hub = new StreamHub(
    {
      summary: () => analytics.citySummary(),
      snapshot: () => ({ incidents: store.activeIncidents(), summary: analytics.citySummary() }),
    },
    { ...DEFAULT_STREAM_OPTIONS, ...opts.stream },
  );

  const handle = (window: SourceWindow): void => {
    try {
      for (const change of store.sync(window)) hub.publish(change);
    } catch (err) {
      opts.onError?.(err);
    }
  };
  source.subscribe(handle);

  return {
    source,
    store,
    analytics,
    hub,
    clock,
    startedAt: clock(),
    isHealthy: () => {
      const last = source.lastSuccessAt();
      return last !== null && clock() - last <= STALE_AFTER_MS;
    },
    start: () => {
      source.start();
      hub.start();
    },
    stop: () => {
      source.stop();
      hub.stop();
    },
  };
}
