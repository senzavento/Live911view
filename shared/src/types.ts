/**
 * Contratto dati condiviso tra server e web.
 * Tutti i dati sono SINTETICI (simulatore): nessun dato reale di cittadini.
 */

export const INCIDENT_TYPES = ['fire', 'medical', 'police', 'traffic', 'hazmat', 'rescue'] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export type IncidentStatus = 'dispatched' | 'on_scene' | 'resolved';
/** 1 = critica, 2 = alta, 3 = normale */
export type Priority = 1 | 2 | 3;

export interface Incident {
  id: string;
  type: IncidentType;
  priority: Priority;
  status: IncidentStatus;
  cityId: string;
  /** Codice stato USPS a 2 lettere, es. "TX" */
  state: string;
  lat: number;
  lng: number;
  /** Indirizzo sintetico a livello di isolato, es. "1200 block of Main St" */
  address: string;
  description: string;
  unitsAssigned: number;
  /** ISO 8601 UTC */
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface City {
  id: string; // slug, es. "houston-tx"
  name: string;
  state: string;
  lat: number;
  lng: number;
  population: number;
}

export interface StateInfo {
  code: string;
  name: string;
  lat: number;
  lng: number;
}

export type TypeCounts = Record<IncidentType, number>;

/** Livello 0: aggregato nazionale */
export interface NationalSummary {
  generatedAt: string;
  active: number;
  last24h: number;
  /** nuovi incidenti al minuto, media mobile ultimi 5 min */
  ratePerMin: number;
  critical: number;
  avgResponseSec: number;
  byType: TypeCounts;
  byState: StateSummary[];
  /** serie ultimi 60 minuti, un bucket al minuto, dal più vecchio */
  timeline: TimelinePoint[];
}

export interface TimelinePoint {
  t: string;
  total: number;
  byType: TypeCounts;
}

/** Livello 1: stato */
export interface StateSummary {
  code: string;
  name: string;
  active: number;
  critical: number;
  byType: TypeCounts;
  /** incidenti attivi per 100k abitanti */
  per100k: number;
}

/** Livello 2: città */
export interface CitySummary {
  city: City;
  active: number;
  critical: number;
  last24h: number;
  byType: TypeCounts;
  avgResponseSec: number;
  timeline: TimelinePoint[];
}

export interface StateDetail extends StateSummary {
  cities: CitySummary[];
}

/** Livello 3: singolo incidente = Incident (GET /api/incidents/:id) */

/** Eventi SSE su GET /api/stream */
export type StreamEvent =
  | { event: 'snapshot'; data: { incidents: Incident[]; summary: NationalSummary } }
  | { event: 'incident.created'; data: Incident }
  | { event: 'incident.updated'; data: Incident }
  | { event: 'incident.resolved'; data: Incident }
  | { event: 'summary'; data: NationalSummary };
