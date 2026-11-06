import type { SourceStatus } from '@live911/shared';
import { buildApp, type AppOptions } from './app';
import { createRuntime, type Runtime } from './runtime';
import type { IncidentSource, SourceListener, SourceWindow, Unsubscribe } from './source';

/** 2026-11-06 22:00 UTC = 14:00 in San Francisco (PST). */
export const T0 = Date.UTC(2026, 10, 6, 22, 0, 0);

/** Source driven by hand: tests push windows and set its status. */
export class FakeSource implements IncidentSource {
  private listeners = new Set<SourceListener>();
  started = false;
  success: number | null = null;
  statusValue: SourceStatus = {
    name: 'fake', url: 'https://example.test', license: 'test', dataAsOf: null, delaySec: null, lastPollAt: null, ok: true,
  };

  subscribe(listener: SourceListener): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.started = false;
  }
  status(): SourceStatus {
    return this.statusValue;
  }
  lastSuccessAt(): number | null {
    return this.success;
  }
  push(window: Omit<SourceWindow, 'kind' | 'windowStartMs'> & { windowStartMs?: number }): void {
    for (const l of this.listeners) l({ kind: 'window', windowStartMs: T0 - 48 * 3_600_000, ...window });
  }
}

export function testRuntime(): { rt: Runtime; source: FakeSource; setNow: (t: number) => void } {
  let now = T0;
  const source = new FakeSource();
  source.success = T0;
  const rt = createRuntime({ source, clock: () => now, stream: { flushMs: 20 } });
  return { rt, source, setNow: (t) => (now = t) };
}

export async function testApp(rt: Runtime, extra: Pick<AppOptions, 'staticDir' | 'basemap'> = {}) {
  return buildApp(rt, { corsOrigins: ['http://localhost:5173'], logger: false, ...extra });
}
