import type { Incident, SourceStatus } from '@live911/shared';

/**
 * A call with no public location (reserved or unmapped). Only its identity and
 * reception time are kept, so it can be counted but never described.
 */
export interface UnlocatedCall {
  id: string;
  receivedMs: number;
}

/**
 * Complete, validated state of the source's time window. The store diffs it against what it holds
 * and derives the created/updated/resolved events, so a source never has to track changes itself.
 */
export interface SourceWindow {
  kind: 'window';
  /** Start of the covered window (epoch ms); stored calls received after it but absent here are dropped. */
  windowStartMs: number;
  /** Located calls, any status. */
  incidents: Incident[];
  unlocated: UnlocatedCall[];
}

export type SourceEvent = SourceWindow;
export type SourceListener = (event: SourceEvent) => void;
export type Unsubscribe = () => void;

/** Where incidents come from. A new feed only has to emit `SourceWindow`s and report its status. */
export interface IncidentSource {
  /** Registers a listener. Subscribe before start() so no event is missed. */
  subscribe(listener: SourceListener): Unsubscribe;
  /** Begins polling/streaming. Never throws. */
  start(): void;
  /** Stops and releases timers. Idempotent. */
  stop(): void;
  /** Current status for transparency in the UI. */
  status(): SourceStatus;
  /** Epoch ms of the last successful poll, null if none yet. */
  lastSuccessAt(): number | null;
}
