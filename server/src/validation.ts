import { INCIDENT_TYPES, type IncidentStatus, type IncidentType } from '@live911/shared';
import type { IncidentFilter } from './store';

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export interface IncidentQuery {
  filter: IncidentFilter;
  limit: number;
}

export const DEFAULT_LIMIT = 500;
export const MAX_LIMIT = 2000;

const STATUSES: readonly IncidentStatus[] = ['dispatched', 'on_scene', 'resolved'];
const ALLOWED_KEYS = new Set(['type', 'areaId', 'intersectionId', 'status', 'limit']);

/** Id formats produced by the source layer; anything else cannot match a stored entity. */
export const AREA_ID = /^[a-z0-9-]{1,64}$/;
export const INTERSECTION_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const INCIDENT_ID = /^[A-Za-z0-9-]{1,32}$/;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | undefined {
  return allowed.find((a) => a === value);
}

function parseLimit(raw: string): Parsed<number> {
  if (!/^\d{1,5}$/.test(raw)) return fail('limit must be a positive integer');
  const n = Number(raw);
  return n >= 1 && n <= MAX_LIMIT ? { ok: true, value: n } : fail(`limit must be between 1 and ${MAX_LIMIT}`);
}

export function parseIncidentQuery(query: unknown): Parsed<IncidentQuery> {
  const source = (query ?? {}) as Record<string, unknown>;
  const params = new Map<string, string>();
  for (const [key, value] of Object.entries(source)) {
    if (!ALLOWED_KEYS.has(key)) return fail(`unknown query parameter: ${key}`);
    if (typeof value !== 'string') return fail(`${key} must be given once`);
    params.set(key, value);
  }

  const filter: IncidentFilter = {};
  const type = params.get('type');
  if (type !== undefined) {
    const parsed = oneOf<IncidentType>(type, INCIDENT_TYPES);
    if (!parsed) return fail(`type must be one of: ${INCIDENT_TYPES.join(', ')}`);
    filter.type = parsed;
  }
  const areaId = params.get('areaId');
  if (areaId !== undefined) {
    if (!AREA_ID.test(areaId)) return fail('areaId is malformed');
    filter.areaId = areaId;
  }
  const intersectionId = params.get('intersectionId');
  if (intersectionId !== undefined) {
    if (!INTERSECTION_ID.test(intersectionId)) return fail('intersectionId is malformed');
    filter.intersectionId = intersectionId;
  }
  const status = params.get('status');
  if (status !== undefined) {
    const parsed = oneOf<IncidentStatus>(status, STATUSES);
    if (!parsed) return fail(`status must be one of: ${STATUSES.join(', ')}`);
    filter.status = parsed;
  }
  const rawLimit = params.get('limit');
  if (rawLimit === undefined) return { ok: true, value: { filter, limit: DEFAULT_LIMIT } };
  const limit = parseLimit(rawLimit);
  return limit.ok ? { ok: true, value: { filter, limit: limit.value } } : limit;
}
