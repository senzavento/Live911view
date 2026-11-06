import { INCIDENT_TYPES, TYPE_META, type Counts, type Incident, type IncidentType, type TypeCounts } from '@live911/shared';
import type { Selection } from '../store';

export function zeroCounts(): TypeCounts {
  return { violent: 0, property: 0, traffic: 0, disturbance: 0, welfare: 0, alarm: 0, proactive: 0, other: 0 };
}

/** Categorie mostrate (tutte, oppure senza `proactive` se nascosta). */
export function visibleTypes(hideProactive: boolean): readonly IncidentType[] {
  return hideProactive ? INCIDENT_TYPES.filter((t) => t !== 'proactive') : INCIDENT_TYPES;
}

/** Chiamate attive di un ambito, escludendo `proactive` se nascosta. */
export function activeCount(c: Pick<Counts, 'active' | 'byType'>, hideProactive: boolean): number {
  return hideProactive ? Math.max(0, c.active - (c.byType.proactive ?? 0)) : c.active;
}

/** Conteggi per categoria delle chiamate attive nello store, filtrate per ambito. */
export function scopeCounts(incidents: Iterable<Incident>, sel: Selection): TypeCounts {
  const out = zeroCounts();
  for (const inc of incidents) {
    if (inc.status === 'resolved') continue;
    if (sel.areaId && inc.areaId !== sel.areaId) continue;
    if (sel.intersectionId && inc.intersectionId !== sel.intersectionId) continue;
    out[inc.type]++;
  }
  return out;
}

const ts = (s: string | undefined): number => (s ? Date.parse(s) : 0);

/** Attive prima (priorità 1 → 3, poi più recenti); poi risolte, dalle più recenti. */
export function sortIncidents(list: readonly Incident[]): Incident[] {
  return list.slice().sort((a, b) => {
    const ra = a.status === 'resolved' ? 1 : 0;
    const rb = b.status === 'resolved' ? 1 : 0;
    if (ra !== rb) return ra - rb;
    if (!ra && a.priority !== b.priority) return a.priority - b.priority;
    const ta = ra ? ts(a.resolvedAt) || ts(a.createdAt) : ts(a.createdAt);
    const tb = rb ? ts(b.resolvedAt) || ts(b.createdAt) : ts(b.createdAt);
    return tb - ta;
  });
}

/**
 * Unisce la lista dall'API (fonte dei dati) con lo stato live dello store:
 * - una chiamata presente nello store usa la versione live (stato aggiornato);
 * - una chiamata attiva per l'API ma sparita dallo store (a snapshot ricevuto) risulta risolta;
 * - chiamate nuove dello store per lo stesso incrocio vengono aggiunte.
 */
export function mergeIncidents(
  fromApi: readonly Incident[],
  live: ReadonlyMap<string, Incident>,
  intersectionId: string,
  storeReady: boolean,
): Incident[] {
  const out = new Map<string, Incident>();
  for (const inc of fromApi) {
    const l = live.get(inc.id);
    if (l) out.set(inc.id, l);
    else if (storeReady && inc.status !== 'resolved') out.set(inc.id, { ...inc, status: 'resolved', resolvedAt: inc.resolvedAt ?? inc.updatedAt });
    else out.set(inc.id, inc);
  }
  if (storeReady) {
    for (const inc of live.values()) if (inc.intersectionId === intersectionId && !out.has(inc.id)) out.set(inc.id, inc);
  }
  return sortIncidents([...out.values()]);
}

export function withoutProactive<T extends { type: IncidentType }>(list: readonly T[], hide: boolean): T[] {
  return hide ? list.filter((i) => i.type !== 'proactive') : list.slice();
}

/** Etichetta estesa: `proactive` è esplicitata come attività a bassa rilevanza. */
export function typeLabelLong(t: IncidentType): string {
  return t === 'proactive' ? 'Attività di polizia (a bassa rilevanza)' : TYPE_META[t].label;
}
