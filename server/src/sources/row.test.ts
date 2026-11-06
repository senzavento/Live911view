import { describe, expect, it } from 'vitest';
import { rawRow, sensitiveRow } from '../fixtures';
import { parseRow, slugify } from './row';

const incidentOf = (raw: unknown) => {
  const row = parseRow(raw);
  if (row.kind !== 'incident') throw new Error(`expected incident, got ${row.kind}`);
  return row.incident;
};

describe('parseRow: located calls', () => {
  it('maps a dispatched call and converts SF local times to UTC', () => {
    const i = incidentOf(rawRow());
    expect(i).toMatchObject({
      id: '263082274',
      type: 'disturbance',
      priority: 2,
      status: 'dispatched',
      areaId: 'tenderloin',
      areaName: 'Tenderloin',
      intersectionId: '25152000',
      address: 'LARKIN ST \\ OFARRELL ST',
      lat: 37.7851,
      lng: -122.4179,
      description: 'SUSPICIOUS PERSON',
      agency: 'Police',
      officerInitiated: false,
      createdAt: '2026-11-06T21:30:00.000Z',
      dispatchedAt: '2026-11-06T21:32:00.000Z',
      updatedAt: '2026-11-06T21:33:00.000Z',
    });
    expect(i.resolvedAt).toBeUndefined();
    expect(i.onSceneAt).toBeUndefined();
  });

  it('derives on_scene and resolved', () => {
    const onScene = incidentOf(rawRow({ onscene_datetime: '2026-11-06T13:40:00.000' }));
    expect(onScene).toMatchObject({ status: 'on_scene', onSceneAt: '2026-11-06T21:40:00.000Z' });
    const closed = incidentOf(rawRow({ onscene_datetime: '2026-11-06T13:40:00.000', close_datetime: '2026-11-06T13:50:00.000' }));
    expect(closed).toMatchObject({ status: 'resolved', resolvedAt: '2026-11-06T21:50:00.000Z' });
  });

  it('falls back to original type/priority and flags officer-initiated calls', () => {
    const i = incidentOf(rawRow({ call_type_final_desc: undefined, priority_final: undefined, priority_original: 'A', onview_flag: 'Y' }));
    expect(i).toMatchObject({ priority: 1, officerInitiated: true, description: 'SUSPICIOUS PERSON' });
  });

  it('ignores times before reception and clamps a close before reception', () => {
    const i = incidentOf(rawRow({ dispatch_datetime: '2026-11-06T13:00:00.000', close_datetime: '2026-11-06T12:00:00.000' }));
    expect(i.dispatchedAt).toBeUndefined();
    expect(i.resolvedAt).toBe(i.createdAt);
  });

  it('uses "unknown" for a missing neighborhood and a coordinate-based id for a missing intersection id', () => {
    const i = incidentOf(rawRow({ analysis_neighborhood: undefined, intersection_id: undefined }));
    expect(i).toMatchObject({ areaId: 'unknown', areaName: 'Sconosciuto', intersectionId: 'p3778510_12241790' });
  });

  it('replaces the text of delicate categories with the generic label', () => {
    const i = incidentOf(rawRow({ call_type_final_desc: 'ASSAULT / BATTERY DV' }));
    expect(i).toMatchObject({ type: 'violent', description: 'Violenza / armi' });
  });

  it('never carries the free-text notes', () => {
    expect(JSON.stringify(incidentOf(rawRow({ call_type_original_notes: 'SECRET 2' })))).not.toContain('SECRET');
    expect(JSON.stringify(incidentOf(rawRow()))).not.toContain('MUST NEVER LEAK');
  });
});

describe('parseRow: unlocated and invalid', () => {
  it('reduces sensitive calls to id and time, whatever else they carry', () => {
    const row = parseRow(rawRow({ sensitive_call: true }));
    expect(row).toEqual({ kind: 'unlocated', call: { id: '263082274', receivedMs: Date.parse('2026-11-06T21:30:00Z') }, dataAsOfMs: Date.parse('2026-11-06T21:44:08Z') });
    expect(parseRow(sensitiveRow()).kind).toBe('unlocated');
  });

  it.each([
    ['missing flag', { sensitive_call: undefined }],
    ['string true', { sensitive_call: 'true' }],
    ['no point', { intersection_point: undefined }],
    ['malformed point', { intersection_point: { coordinates: ['x', 1] } }],
    ['point outside SF', { intersection_point: { coordinates: [-118.2, 34.05] } }],
  ])('treats %s as unlocated', (_n, overrides) => {
    expect(parseRow(rawRow(overrides)).kind).toBe('unlocated');
  });

  it.each([
    ['not an object', 'x'],
    ['null', null],
    ['array', []],
    ['no cad number', rawRow({ cad_number: undefined })],
    ['unsafe cad number', rawRow({ cad_number: '../etc' })],
    ['no received time', rawRow({ received_datetime: undefined })],
    ['bad received time', rawRow({ received_datetime: 'yesterday' })],
    ['numeric received time', rawRow({ received_datetime: 12345 })],
  ])('rejects %s', (_n, raw) => {
    expect(parseRow(raw).kind).toBe('invalid');
  });

  it('survives hostile field types', () => {
    const row = parseRow(rawRow({ agency: { a: 1 }, intersection_name: 5, call_type_final_desc: ['x'], call_type_original_desc: null }));
    expect(row.kind).toBe('incident');
  });
});

describe('slugify', () => {
  it.each([
    ['Mission', 'mission'],
    ['Bayview Hunters Point', 'bayview-hunters-point'],
    ['Financial District/South Beach', 'financial-district-south-beach'],
    ['Sunset/Parkside', 'sunset-parkside'],
    ['  Castro/Upper Market ', 'castro-upper-market'],
    ['!!!', ''],
  ])('%j -> %j', (name, slug) => expect(slugify(name)).toBe(slug));
});
