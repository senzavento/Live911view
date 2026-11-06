import type { Incident } from '@live911/shared';
import { describe, expect, it } from 'vitest';
import { activeCount, mergeIncidents, scopeCounts, sortIncidents, visibleTypes, withoutProactive, zeroCounts } from './scope';

const inc = (o: Partial<Incident> & { id: string }): Incident => ({
  type: 'property',
  priority: 3,
  status: 'dispatched',
  areaId: 'mission',
  areaName: 'Mission',
  intersectionId: 'ix1',
  address: 'A \\ B',
  lat: 0,
  lng: 0,
  description: 'X',
  agency: 'Police',
  officerInitiated: false,
  createdAt: '2026-11-06T22:00:00Z',
  updatedAt: '2026-11-06T22:00:00Z',
  ...o,
});

describe('scope', () => {
  it('nasconde proactive dai conteggi e dalle categorie', () => {
    const c = { active: 10, byType: { ...zeroCounts(), proactive: 4, violent: 6 } };
    expect(activeCount(c, false)).toBe(10);
    expect(activeCount(c, true)).toBe(6);
    expect(visibleTypes(true)).not.toContain('proactive');
    expect(visibleTypes(false)).toHaveLength(8);
    expect(withoutProactive([inc({ id: '1' }), inc({ id: '2', type: 'proactive' })], true).map((i) => i.id)).toEqual(['1']);
  });
  it('conta le attive per ambito', () => {
    const list = [inc({ id: '1' }), inc({ id: '2', areaId: 'soma', intersectionId: 'ix2', type: 'violent' }), inc({ id: '3', status: 'resolved' })];
    expect(scopeCounts(list, {}).property).toBe(1);
    expect(scopeCounts(list, { areaId: 'soma' }).violent).toBe(1);
    expect(scopeCounts(list, { intersectionId: 'ix1' }).property).toBe(1);
  });
  it('ordina: attive per priorità poi recenza, poi risolte dalle più recenti', () => {
    const sorted = sortIncidents([
      inc({ id: 'res-old', status: 'resolved', resolvedAt: '2026-11-06T20:00:00Z' }),
      inc({ id: 'p3-new', priority: 3, createdAt: '2026-11-06T22:10:00Z' }),
      inc({ id: 'p1-old', priority: 1, createdAt: '2026-11-06T21:00:00Z' }),
      inc({ id: 'res-new', status: 'resolved', resolvedAt: '2026-11-06T21:30:00Z' }),
      inc({ id: 'p3-old', priority: 3, createdAt: '2026-11-06T21:50:00Z' }),
    ]).map((i) => i.id);
    expect(sorted).toEqual(['p1-old', 'p3-new', 'p3-old', 'res-new', 'res-old']);
  });
  it('unisce API e store: stato live, sparite = risolte, nuove aggiunte', () => {
    const api = [inc({ id: 'a' }), inc({ id: 'b' }), inc({ id: 'c', status: 'resolved', resolvedAt: '2026-11-06T21:00:00Z' })];
    const live = new Map([
      ['a', inc({ id: 'a', status: 'on_scene' })],
      ['n', inc({ id: 'n', priority: 1 })],
      ['x', inc({ id: 'x', intersectionId: 'altro' })],
    ]);
    const merged = mergeIncidents(api, live, 'ix1', true);
    const byId = new Map(merged.map((i) => [i.id, i]));
    expect(byId.get('a')?.status).toBe('on_scene');
    expect(byId.get('b')?.status).toBe('resolved'); // non più nello store
    expect(byId.has('n')).toBe(true);
    expect(byId.has('x')).toBe(false);
    expect(merged[0]?.id).toBe('n');
    // store non pronto: i dati dell'API restano com'è
    expect(mergeIncidents(api, new Map(), 'ix1', false).find((i) => i.id === 'b')?.status).toBe('dispatched');
  });
});
