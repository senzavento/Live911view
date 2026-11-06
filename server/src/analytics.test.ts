import { INCIDENT_TYPES, type Incident } from '@live911/shared';
import { describe, expect, it } from 'vitest';
import { Analytics } from './analytics';
import { incident } from './fixtures';
import { IncidentStore } from './store';
import { FakeSource, T0 } from './testing';

const HOUR = 3_600_000;
const sum = (c: Record<string, number>): number => Object.values(c).reduce((a, b) => a + b, 0);

function build(incidents: Incident[], unlocatedAges: number[] = [], now = T0) {
  // wide active window: these tests are about aggregation, expiry has its own tests
  const store = new IncidentStore(() => now, 48 * HOUR);
  store.sync({
    kind: 'window',
    windowStartMs: now - 48 * HOUR,
    incidents,
    unlocated: unlocatedAges.map((age, i) => ({ id: `u${i}`, receivedMs: now - age })),
  });
  const source = new FakeSource();
  return new Analytics(store, () => now, () => source.status());
}

const many = (n: number, make: (i: number) => Partial<Incident>, ageMs = HOUR): Incident[] =>
  Array.from({ length: n }, (_v, i) => incident({ id: `c${i}`, ...make(i) }, T0 - ageMs - i * 1000));

describe('city summary', () => {
  const incidents = [
    ...many(6, () => ({ type: 'violent' as const, priority: 1 as const })),
    ...many(4, (i) => ({ id: `d${i}`, type: 'traffic' as const, areaId: 'soma', areaName: 'SoMa', intersectionId: '200' }), 5 * HOUR),
    incident({ id: 'closed', status: 'resolved', resolvedAt: new Date(T0).toISOString() }, T0 - 2 * HOUR),
    incident({ id: 'old', type: 'alarm' }, T0 - 30 * HOUR), // active but outside 24 h
  ];
  const a = build(incidents, [30 * 60_000, 3 * HOUR, 40 * HOUR]);
  const s = a.citySummary();

  it('counts active, critical and last24h (unlocated included)', () => {
    expect(s.active).toBe(6 + 4 + 1);
    expect(s.critical).toBe(6);
    expect(s.unlocated24h).toBe(2);
    expect(s.last24h).toBe(6 + 4 + 1 + 2); // located within 24 h (incl. the closed one) + unlocated within 24 h
  });

  it('keeps sums consistent', () => {
    expect(sum(s.byType)).toBe(s.active);
    expect(Object.keys(s.byType).sort()).toEqual([...INCIDENT_TYPES].sort());
    expect(s.byArea.reduce((n, x) => n + x.active, 0)).toBe(s.active);
    expect(s.byArea.reduce((n, x) => n + x.last24h, 0) + s.unlocated24h).toBe(s.last24h);
    for (const area of s.byArea) expect(sum(area.byType)).toBe(area.active);
  });

  it('rates the last hour including unlocated calls', () => {
    expect(s.ratePerHour).toBe(1); // only the unlocated call from 30 min ago is within the hour
  });

  it('builds 24 hourly buckets ending in the current hour, located calls only', () => {
    expect(s.timeline).toHaveLength(24);
    expect(s.timeline[23]?.t).toBe('2026-11-06T22:00:00.000Z');
    expect(s.timeline[0]?.t).toBe('2026-11-05T23:00:00.000Z');
    expect(s.timeline.every((p) => p.total === sum(p.byType))).toBe(true);
    expect(s.timeline.reduce((n, p) => n + p.total, 0)).toBe(6 + 4 + 1);
    expect(s.timeline[22]?.byType.violent).toBe(1); // received exactly 21:00:00
    expect(s.timeline[21]?.byType.violent).toBe(5); // 20:59:5x
  });

  it('exposes the source status and sorts areas by activity', () => {
    expect(s.source.name).toBe('fake');
    expect(s.byArea.map((x) => x.id)).toEqual(['mission', 'soma']);
  });
});

describe('medianCriticalDispatchSec', () => {
  const critical = (over: Partial<Incident> = {}): Partial<Incident> => ({ priority: 1, ...over });
  /** dispatch time `delayMs` after the i-th call of `many` (default age 1 h) */
  const dispatchAfter = (i: number, delayMs: number): string => new Date(T0 - HOUR - i * 1000 + delayMs).toISOString();

  it('is null below 10 critical samples; non-critical and officer-initiated calls are ignored', () => {
    const few = build(many(9, () => critical()));
    expect(few.citySummary().medianCriticalDispatchSec).toBeNull();
    const rows = [
      ...many(10, () => critical()),
      ...many(5, (i) => critical({ id: `o${i}`, officerInitiated: true })),
      ...many(5, (i) => ({ id: `n${i}`, priority: 3 as const, dispatchedAt: dispatchAfter(i, 900_000) })),
    ];
    expect(build(rows).citySummary().medianCriticalDispatchSec).toBe(60);
  });

  it('uses the median, so one slow call does not drag it', () => {
    const rows = many(11, (i) => critical(i === 0 ? { dispatchedAt: dispatchAfter(0, 7_200_000) } : {}));
    expect(build(rows).citySummary().medianCriticalDispatchSec).toBe(60);
  });

  it('ignores calls without dispatch time', () => {
    const rows = many(14, (i) => critical(i < 3 ? { dispatchedAt: undefined } : {}));
    expect(build(rows).citySummary().medianCriticalDispatchSec).toBe(60);
  });
});

describe('areas and intersections', () => {
  const rows = [
    ...many(3, () => ({ intersectionId: '1', address: 'A ST \\ B ST' })),
    ...many(2, (i) => ({ id: `s${i}`, intersectionId: '2', address: 'C ST \\ D ST', status: 'resolved' as const })),
    ...many(1, () => ({ id: 'x', areaId: 'soma', areaName: 'SoMa', intersectionId: '3' })),
  ];
  const a = build(rows);

  it('lists stable areas', () => {
    expect(a.areas().map((x) => x.id)).toEqual(['mission', 'soma']);
  });

  it('details an area with ranked intersections', () => {
    const d = a.areaDetail('mission');
    expect(d).toMatchObject({ id: 'mission', active: 3, last24h: 5 });
    expect(d?.intersections.map((i) => [i.id, i.active, i.last24h])).toEqual([['1', 3, 3], ['2', 0, 2]]);
    expect(d?.timeline).toHaveLength(24);
    expect(a.areaDetail('nowhere')).toBeUndefined();
  });

  it('caps hotspots at 50 per area', () => {
    const big = build(many(80, (i) => ({ id: `i${i}`, intersectionId: `n${i}` })));
    expect(big.areaDetail('mission')?.intersections).toHaveLength(50);
  });

  it('details an intersection with newest incidents first', () => {
    const d = a.intersectionDetail('1');
    expect(d).toMatchObject({ id: '1', name: 'A ST \\ B ST', areaId: 'mission', active: 3 });
    expect(d?.incidents.map((i) => i.id)).toEqual(['c0', 'c1', 'c2']);
    expect(a.intersectionDetail('999')).toBeUndefined();
  });
});

describe('caching', () => {
  it('recomputes when time moves on', () => {
    let now = T0;
    // wide active window: these tests are about aggregation, expiry has its own tests
  const store = new IncidentStore(() => now, 48 * HOUR);
    store.sync({ kind: 'window', windowStartMs: now - 48 * HOUR, incidents: many(1, () => ({})), unlocated: [] });
    const analytics = new Analytics(store, () => now, () => new FakeSource().status());
    expect(analytics.citySummary().last24h).toBe(1);
    now = T0 + 25 * HOUR;
    expect(analytics.citySummary().last24h).toBe(0);
  });
});
