import type { City, StateInfo } from '@live911/shared';
import { Aggregator } from './aggregate';
import { CITIES } from './data/cities';
import { STATES } from './data/states';
import { Simulator } from './sim/simulator';
import type { IncidentSource, SourceEvent } from './source';
import { IncidentStore } from './store';
import { DEFAULT_STREAM_OPTIONS, StreamHub, type StreamOptions } from './stream';

export interface RuntimeOptions {
  seed: number;
  rate: number;
  cities?: readonly City[];
  states?: readonly StateInfo[];
  clock?: () => number;
  stream?: Partial<StreamOptions>;
  /** override the data source (default: the simulator) */
  source?: IncidentSource;
  onError?: (err: unknown) => void;
}

export interface Runtime {
  cities: readonly City[];
  states: readonly StateInfo[];
  source: IncidentSource;
  store: IncidentStore;
  aggregator: Aggregator;
  hub: StreamHub;
  clock: () => number;
  startedAt: number;
  start(): void;
  stop(): void;
}

const EVENT_NAMES = {
  created: 'incident.created',
  updated: 'incident.updated',
  resolved: 'incident.resolved',
} as const;

/** Wires source -> store -> aggregator -> SSE hub. */
export function createRuntime(opts: RuntimeOptions): Runtime {
  const cities = opts.cities ?? CITIES;
  const states = opts.states ?? STATES;
  const clock = opts.clock ?? Date.now;
  const source = opts.source ?? new Simulator({ cities, ratePerSec: opts.rate, seed: opts.seed });
  const store = new IncidentStore();
  const aggregator = new Aggregator(cities, states, clock);
  const hub = new StreamHub(
    {
      summary: () => aggregator.nationalSummary(),
      snapshot: () => ({ incidents: store.activeIncidents(), summary: aggregator.nationalSummary() }),
    },
    { ...DEFAULT_STREAM_OPTIONS, ...opts.stream },
  );

  const handle = (event: SourceEvent): void => {
    try {
      const prev = store.apply(event);
      aggregator.ingest(event, prev);
      if (event.kind !== 'history') hub.publish({ event: EVENT_NAMES[event.kind], data: event.incident });
    } catch (err) {
      opts.onError?.(err);
    }
  };
  source.subscribe(handle);

  return {
    cities,
    states,
    source,
    store,
    aggregator,
    hub,
    clock,
    startedAt: clock(),
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
