import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Incident, NationalSummary, StreamEvent } from '@live911/shared';

export interface StreamOptions {
  flushMs: number;
  summaryMs: number;
  heartbeatMs: number;
  /** a client whose socket buffer exceeds this is dropped (it can reconnect for a fresh snapshot) */
  maxBufferBytes: number;
  /** a client that does not drain for this long is dropped */
  maxBlockedMs: number;
  maxClients: number;
}

export const DEFAULT_STREAM_OPTIONS: StreamOptions = {
  flushMs: 250,
  summaryMs: 2000,
  heartbeatMs: 15_000,
  maxBufferBytes: 4 * 1024 * 1024,
  maxBlockedMs: 30_000,
  maxClients: 500,
};

export interface StreamSources {
  snapshot(): { incidents: Incident[]; summary: NationalSummary };
  summary(): NationalSummary;
}

interface Client {
  res: ServerResponse;
  blockedSince: number | null;
}

export const frame = (event: StreamEvent): string => `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;

/** Fans events out to SSE clients, batching them into one write per flush interval. */
export class StreamHub {
  private readonly clients = new Set<Client>();
  private pending: string[] = [];
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly sources: StreamSources,
    private readonly opts: StreamOptions = DEFAULT_STREAM_OPTIONS,
  ) {}

  get size(): number {
    return this.clients.size;
  }

  get isFull(): boolean {
    return this.clients.size >= this.opts.maxClients;
  }

  start(): void {
    if (this.timers.length) return;
    const every = (fn: () => void, ms: number) => {
      const timer = setInterval(fn, ms);
      timer.unref();
      this.timers.push(timer);
    };
    every(() => this.flush(), this.opts.flushMs);
    every(() => this.publish({ event: 'summary', data: this.sources.summary() }), this.opts.summaryMs);
    every(() => this.writeAll(': ping\n\n'), this.opts.heartbeatMs);
  }

  stop(): void {
    this.timers.forEach(clearInterval);
    this.timers = [];
    for (const client of this.clients) client.res.end();
    this.clients.clear();
    this.pending = [];
  }

  /** Queues an event for the next flush. Free when nobody is listening. */
  publish(event: StreamEvent): void {
    if (this.clients.size > 0) this.pending.push(frame(event));
  }

  /** Takes over the response and streams to it until the client goes away. */
  attach(req: IncomingMessage, res: ServerResponse, baseHeaders: Readonly<Record<string, string | number | string[] | undefined>>): void {
    // Deliver queued events to existing clients first, so the snapshot below is
    // consistent with everything a new client will receive afterwards.
    this.flush();
    req.socket.setNoDelay(true);
    req.socket.setTimeout(0);
    res.writeHead(200, {
      ...baseHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const client: Client = { res, blockedSince: null };
    const remove = () => this.clients.delete(client);
    res.on('close', remove);
    res.on('error', remove);
    res.on('drain', () => {
      client.blockedSince = null;
    });
    this.clients.add(client);
    const snapshot: StreamEvent = { event: 'snapshot', data: this.sources.snapshot() };
    this.write(client, `retry: 3000\n\n${frame(snapshot)}`);
  }

  private flush(): void {
    if (this.pending.length === 0) return;
    const payload = this.pending.join('');
    this.pending = [];
    this.writeAll(payload);
  }

  private writeAll(payload: string): void {
    for (const client of [...this.clients]) this.write(client, payload);
  }

  private write(client: Client, payload: string): void {
    const { res } = client;
    if (res.destroyed || res.writableEnded) {
      this.clients.delete(client);
      return;
    }
    const now = Date.now();
    const stalled = client.blockedSince !== null && now - client.blockedSince > this.opts.maxBlockedMs;
    if (stalled || res.writableLength > this.opts.maxBufferBytes) {
      this.clients.delete(client);
      res.destroy();
      return;
    }
    if (!res.write(payload) && client.blockedSince === null) client.blockedSince = now;
  }
}
