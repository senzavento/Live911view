import type { Incident, IncidentStatus, IncidentType } from '@live911/shared';
import type { SourceEvent } from './source';

export interface IncidentFilter {
  type?: IncidentType;
  state?: string;
  cityId?: string;
  status?: IncidentStatus;
}

const matches = (i: Incident, f: IncidentFilter): boolean =>
  (!f.type || i.type === f.type) &&
  (!f.state || i.state === f.state) &&
  (!f.cityId || i.cityId === f.cityId) &&
  (!f.status || i.status === f.status);

/** Fixed-capacity buffer of the most recently resolved incidents. */
class ResolvedBuffer {
  private readonly slots: (Incident | undefined)[];
  private readonly byId = new Map<string, Incident>();
  private next = 0;

  constructor(private readonly capacity: number) {
    this.slots = new Array<Incident | undefined>(capacity);
  }

  push(incident: Incident): void {
    const evicted = this.slots[this.next];
    if (evicted) this.byId.delete(evicted.id);
    this.slots[this.next] = incident;
    this.byId.set(incident.id, incident);
    this.next = (this.next + 1) % this.capacity;
  }

  get(id: string): Incident | undefined {
    return this.byId.get(id);
  }

  /** Newest first. */
  query(filter: IncidentFilter, limit: number): Incident[] {
    const out: Incident[] = [];
    for (let i = 1; i <= this.capacity && out.length < limit; i++) {
      const incident = this.slots[(this.next - i + this.capacity) % this.capacity];
      if (!incident) break;
      if (matches(incident, filter)) out.push(incident);
    }
    return out;
  }
}

export class IncidentStore {
  private readonly active = new Map<string, Incident>();
  private readonly resolved: ResolvedBuffer;

  constructor(resolvedCapacity = 5000) {
    this.resolved = new ResolvedBuffer(resolvedCapacity);
  }

  /** Applies an event and returns the previously active version of the incident, if any. */
  apply(event: SourceEvent): Incident | undefined {
    if (event.kind === 'history') return undefined;
    const { incident } = event;
    const prev = this.active.get(incident.id);
    if (event.kind === 'resolved') {
      this.active.delete(incident.id);
      this.resolved.push(incident);
    } else {
      this.active.set(incident.id, incident);
    }
    return prev;
  }

  get activeCount(): number {
    return this.active.size;
  }

  get(id: string): Incident | undefined {
    return this.active.get(id) ?? this.resolved.get(id);
  }

  activeIncidents(): Incident[] {
    return [...this.active.values()];
  }

  /** Newest first. Without `status` only unresolved incidents are returned. */
  query(filter: IncidentFilter, limit: number): Incident[] {
    if (filter.status === 'resolved') return this.resolved.query(filter, limit);
    const out: Incident[] = [];
    for (const incident of this.active.values()) if (matches(incident, filter)) out.push(incident);
    return out.reverse().slice(0, limit);
  }
}
