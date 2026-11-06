import type { Incident, TypeCounts } from '@live911/shared';

/**
 * Counts of incidents that happened in the past but are no longer tracked
 * individually. They only feed the rolling 24h totals.
 */
export interface HistoryBatch {
  kind: 'history';
  cityId: string;
  /** epoch ms the counts are attributed to */
  at: number;
  counts: TypeCounts;
}

export type SourceEvent =
  | { kind: 'created'; incident: Incident }
  | { kind: 'updated'; incident: Incident }
  | { kind: 'resolved'; incident: Incident }
  | HistoryBatch;

export type SourceListener = (event: SourceEvent) => void;
export type Unsubscribe = () => void;

/**
 * Where incidents come from. The simulator implements it; a real CAD/911 feed
 * adapter only has to emit the same events (see server/README.md).
 */
export interface IncidentSource {
  /** Registers a listener. Subscribe before start() so no event is missed. */
  subscribe(listener: SourceListener): Unsubscribe;
  /** Begins emitting events (may emit an initial backlog synchronously). */
  start(): void;
  /** Stops emitting and releases timers. Idempotent. */
  stop(): void;
}
