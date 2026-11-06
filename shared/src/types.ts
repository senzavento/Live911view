/**
 * Contratto dati condiviso tra server e web.
 * Sorgente: DataSF "Law Enforcement Dispatched Calls for Service: Real-Time" (dati reali, pubblici,
 * ritardati di ~10-20 min, solo chiamate dispatchate a polizia/sceriffo/MTA/HEART). Licenza PDDL.
 * Le chiamate "sensibili" non hanno posizione: non sono mai esposte come Incident, solo contate.
 */

/** Categorie derivate dai call type della CAD (mappatura nel server). */
export const INCIDENT_TYPES = [
  'violent', // violenza / armi
  'property', // reati contro il patrimonio
  'traffic', // incidenti e pericoli stradali
  'disturbance', // disturbo, persone/veicoli sospetti
  'welfare', // assistenza, benessere, persone scomparse
  'alarm', // allarmi
  'proactive', // attività di polizia (fermi, multe, appuntamenti)
  'other',
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

/**
 * `expired` = non chiusa nella fonte ma senza aggiornamenti da troppo tempo: la chiusura non è stata
 * registrata, quindi NON è più considerata in corso (né attiva nei conteggi).
 */
export type IncidentStatus = 'dispatched' | 'on_scene' | 'resolved' | 'expired';
/** 1 = critica (priorità A), 2 = alta (B), 3 = normale (C) */
export type Priority = 1 | 2 | 3;

/** Livello 3: singola chiamata con posizione (a livello di incrocio, già mascherata dalla fonte). */
export interface Incident {
  /** CAD number */
  id: string;
  type: IncidentType;
  priority: Priority;
  status: IncidentStatus;
  areaId: string; // quartiere, slug (es. "mission"); "unknown" se assente
  areaName: string;
  intersectionId: string;
  /** es. "MINNA ST \\ RUSS ST" */
  address: string;
  lat: number;
  lng: number;
  /** Descrizione originale della fonte, o etichetta generica per categorie delicate (suicidio, violenza domestica, salute mentale...). */
  description: string;
  /** Police | Sheriff | Municipal Transportation Agency | HEART | ... */
  agency: string;
  /** true = iniziata dall'agente (on-view), non da una chiamata 911 */
  officerInitiated: boolean;
  /** ISO 8601 UTC (la fonte è in ora di San Francisco: il server converte) */
  createdAt: string;
  dispatchedAt?: string;
  onSceneAt?: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface AreaInfo {
  id: string;
  name: string;
  /** centroide ricavato dalle posizioni osservate */
  lat: number;
  lng: number;
}

export interface IntersectionInfo {
  id: string;
  name: string;
  areaId: string;
  lat: number;
  lng: number;
}

export type TypeCounts = Record<IncidentType, number>;

export interface TimelinePoint {
  /** inizio del bucket orario, ISO UTC */
  t: string;
  total: number;
  byType: TypeCounts;
}

/** Stato della sorgente dati, mostrato in UI per trasparenza. */
export interface SourceStatus {
  name: string;
  url: string;
  license: string;
  /** ultimo `data_as_of` della fonte (ISO UTC), null se mai caricato */
  dataAsOf: string | null;
  /** ritardo stimato tra ora e dataAsOf, secondi */
  delaySec: number | null;
  lastPollAt: string | null;
  ok: boolean;
  lastError?: string;
}

/** Contatori comuni a tutti i livelli */
export interface Counts {
  /** chiamate in corso (non chiuse e aggiornate di recente), con posizione */
  active: number;
  /** chiamate ricevute nelle ultime 24 h (incluse quelle senza posizione) */
  last24h: number;
  /** attive con priorità 1 */
  critical: number;
  byType: TypeCounts;
}

/** Livello 1 (riga di classifica): quartiere */
export interface AreaSummary extends Counts {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/** Livello 0: San Francisco intera */
export interface CitySummary extends Counts {
  generatedAt: string;
  /** chiamate ricevute nell'ultima ora */
  ratePerHour: number;
  /** mediana ricezione→dispatch (secondi) delle sole chiamate critiche (priorità 1) con posizione, ultime 24 h; null se < 10 campioni */
  medianCriticalDispatchSec: number | null;
  /** chiamate delle ultime 24 h senza posizione (riservate): contate ma non mappabili */
  unlocated24h: number;
  /** 24 bucket orari, dal più vecchio */
  timeline: TimelinePoint[];
  byArea: AreaSummary[];
  source: SourceStatus;
}

export interface IntersectionSummary extends Counts {
  id: string;
  name: string;
  areaId: string;
  lat: number;
  lng: number;
}

/** Livello 1: quartiere */
export interface AreaDetail extends AreaSummary {
  medianCriticalDispatchSec: number | null;
  timeline: TimelinePoint[];
  /** incroci con più chiamate (attive prima, poi ultime 24 h), max 50 */
  intersections: IntersectionSummary[];
}

/** Livello 2: incrocio */
export interface IntersectionDetail extends IntersectionSummary {
  /** chiamate degli ultimi 2 giorni all'incrocio, più recenti prima, max 100 */
  incidents: Incident[];
}

/** Eventi SSE su GET /api/stream (solo chiamate con posizione, non risolte nello snapshot). */
export type StreamEvent =
  | { event: 'snapshot'; data: { incidents: Incident[]; summary: CitySummary } }
  | { event: 'incident.created'; data: Incident }
  | { event: 'incident.updated'; data: Incident }
  | { event: 'incident.resolved'; data: Incident }
  | { event: 'summary'; data: CitySummary };

/** Basemap raster opzionale, configurata a runtime dall'operatore (mai nel codice/immagine). */
export interface BasemapConfig {
  /** Template XYZ https con {z}/{x}/{y} */
  tiles: string;
  tileSize: 256 | 512;
  maxzoom: number;
  /** Testo semplice; il client lo mostra come testo. */
  attribution: string;
}

/** GET /api/config */
export interface AppConfig {
  basemap: BasemapConfig | null;
}
