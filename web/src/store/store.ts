import type { CitySummary, Incident, StreamEvent } from '@live911/shared';

/** Selezione di drill-down: San Francisco → quartiere → incrocio → chiamata. */
export interface Selection {
  areaId?: string;
  intersectionId?: string;
  incidentId?: string;
}

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting';

export type StoreEvent =
  | { kind: 'snapshot' }
  | { kind: 'incident'; op: 'created' | 'updated' | 'resolved'; incident: Incident }
  | { kind: 'summary' }
  | { kind: 'selection' }
  | { kind: 'connection' };

type Listener = (e: StoreEvent) => void;

/** Stato live dell'app. Unica fonte di verità per mappa e pannelli. */
export class Store {
  readonly incidents = new Map<string, Incident>();
  summary: CitySummary | null = null;
  selection: Selection = {};
  connection: ConnectionStatus = 'connecting';

  private listeners = new Set<Listener>();
  private source: EventSource | null = null;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: StoreEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  /** Imposta la selezione; i livelli inferiori vengono azzerati se non specificati. */
  select(sel: Selection): void {
    this.selection = { ...sel };
    this.emit({ kind: 'selection' });
  }

  clearSelection(): void {
    this.select({});
  }

  connect(url = '/api/stream'): void {
    this.source?.close();
    const es = new EventSource(url);
    this.source = es;

    es.onopen = () => this.setConnection('live');
    es.onerror = () => this.setConnection(es.readyState === EventSource.CLOSED ? 'connecting' : 'reconnecting');

    const on = <T extends StreamEvent['event']>(name: T, fn: (data: Extract<StreamEvent, { event: T }>['data']) => void) =>
      es.addEventListener(name, (ev) => {
        try {
          fn(JSON.parse((ev as MessageEvent<string>).data));
        } catch (err) {
          console.error(`Evento SSE "${name}" non valido`, err);
        }
      });

    on('snapshot', (d) => {
      this.incidents.clear();
      for (const i of d.incidents) this.incidents.set(i.id, i);
      this.summary = d.summary;
      this.emit({ kind: 'snapshot' });
    });
    on('incident.created', (i) => this.applyIncident('created', i));
    on('incident.updated', (i) => this.applyIncident('updated', i));
    on('incident.resolved', (i) => this.applyIncident('resolved', i));
    on('summary', (s) => {
      this.summary = s;
      this.emit({ kind: 'summary' });
    });
  }

  disconnect(): void {
    this.source?.close();
    this.source = null;
  }

  private setConnection(c: ConnectionStatus): void {
    if (this.connection === c) return;
    this.connection = c;
    this.emit({ kind: 'connection' });
  }

  private applyIncident(op: 'created' | 'updated' | 'resolved', incident: Incident): void {
    if (op === 'resolved') this.incidents.delete(incident.id);
    else this.incidents.set(incident.id, incident);
    this.emit({ kind: 'incident', op, incident });
  }
}
