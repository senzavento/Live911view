import type { Incident } from '@live911/shared';
import type { UnlocatedCall } from '../source';
import { sfLocalToUtc } from '../time';
import { deriveStatus, mapCallType, mapPriority } from './mapping';
import { publicDescription } from './sensitive';

export type ParsedRow =
  | { kind: 'incident'; incident: Incident; dataAsOfMs?: number }
  | { kind: 'unlocated'; call: UnlocatedCall; dataAsOfMs?: number }
  | { kind: 'invalid' };

/** Rough San Francisco box; points outside it are treated as unlocated rather than trusted. */
const BOUNDS = { minLat: 37.6, maxLat: 37.9, minLng: -122.65, maxLng: -122.3 };
const CAD_NUMBER = /^[A-Za-z0-9-]{1,32}$/;
const UNKNOWN_AREA = { id: 'unknown', name: 'Sconosciuto' };

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Trimmed, control-character-free, length-capped text; undefined if empty or not a string. */
function text(rec: Rec, key: string, max = 100): string | undefined {
  const v = rec[key];
  if (typeof v !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const clean = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  return clean === '' ? undefined : clean;
}

function time(rec: Rec, key: string): number | undefined {
  const v = text(rec, key, 40);
  return v === undefined ? undefined : sfLocalToUtc(v);
}

/** Socrata checkboxes are booleans; accept the string form too. Anything else counts as "not explicitly false". */
const isFalse = (v: unknown): boolean => v === false || v === 'false';

function point(rec: Rec): { lat: number; lng: number } | undefined {
  const p = rec.intersection_point;
  if (!isRecord(p) || !Array.isArray(p.coordinates)) return undefined;
  const [lng, lat] = p.coordinates as unknown[];
  if (typeof lng !== 'number' || typeof lat !== 'number') return undefined;
  const inBox = lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat && lng >= BOUNDS.minLng && lng <= BOUNDS.maxLng;
  return inBox ? { lat, lng } : undefined;
}

/** Socrata serialises numeric ids as "27074000.0"; ids are used in URLs so keep only a safe form. */
function intersectionId(rec: Rec, p: { lat: number; lng: number }): string {
  const raw = text(rec, 'intersection_id', 40)?.replace(/\.0+$/, '');
  if (raw && /^[A-Za-z0-9_-]{1,40}$/.test(raw)) return raw;
  return `p${Math.round(p.lat * 1e5)}_${Math.round(-p.lng * 1e5)}`;
}

export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
  return slug;
}

function area(rec: Rec): { id: string; name: string } {
  const name = text(rec, 'analysis_neighborhood', 60);
  const id = name ? slugify(name) : '';
  return name && id ? { id, name } : UNKNOWN_AREA;
}

const iso = (ms: number): string => new Date(ms).toISOString();

/**
 * Validates one raw row. Delicate (`sensitive_call`) and unmapped rows are reduced to id + time
 * before anything else is read, so nothing about them can leak further down the pipeline.
 * The `*_notes` fields are never read.
 */
export function parseRow(raw: unknown): ParsedRow {
  if (!isRecord(raw)) return { kind: 'invalid' };
  const id = text(raw, 'cad_number', 32);
  const receivedMs = time(raw, 'received_datetime');
  if (id === undefined || !CAD_NUMBER.test(id) || receivedMs === undefined) return { kind: 'invalid' };
  const dataAsOfMs = time(raw, 'data_as_of');

  const pos = isFalse(raw.sensitive_call) ? point(raw) : undefined;
  if (!pos) return { kind: 'unlocated', call: { id, receivedMs }, dataAsOfMs };

  const sourceText = text(raw, 'call_type_final_desc', 80) ?? text(raw, 'call_type_original_desc', 80) ?? 'UNKNOWN';
  const type = mapCallType(sourceText);
  const dispatchMs = time(raw, 'dispatch_datetime');
  const onSceneMs = time(raw, 'onscene_datetime');
  const closeMs = time(raw, 'close_datetime');
  // Times before reception are source glitches: ignore them rather than show negative durations.
  const valid = (ms: number | undefined): number | undefined => (ms !== undefined && ms >= receivedMs ? ms : undefined);
  const closedMs = closeMs === undefined ? undefined : Math.max(closeMs, receivedMs);
  const status = deriveStatus({ receivedMs, onSceneMs: valid(onSceneMs), closedMs });
  const updatedMs = Math.max(time(raw, 'call_last_updated_at') ?? 0, closedMs ?? 0, valid(onSceneMs) ?? 0, valid(dispatchMs) ?? 0, receivedMs);
  const where = area(raw);
  const incident: Incident = {
    id,
    type,
    priority: mapPriority(text(raw, 'priority_final', 4) ?? text(raw, 'priority_original', 4)),
    status,
    areaId: where.id,
    areaName: where.name,
    intersectionId: intersectionId(raw, pos),
    address: text(raw, 'intersection_name', 100) ?? '',
    lat: pos.lat,
    lng: pos.lng,
    description: publicDescription(sourceText, type),
    agency: text(raw, 'agency', 60) ?? 'Unknown',
    officerInitiated: raw.onview_flag === 'Y',
    createdAt: iso(receivedMs),
    updatedAt: iso(updatedMs),
  };
  const dispatched = valid(dispatchMs);
  if (dispatched !== undefined) incident.dispatchedAt = iso(dispatched);
  const onScene = valid(onSceneMs);
  if (onScene !== undefined) incident.onSceneAt = iso(onScene);
  if (closedMs !== undefined) incident.resolvedAt = iso(closedMs);
  return { kind: 'incident', incident, dataAsOfMs };
}
