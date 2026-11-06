import { INCIDENT_TYPES } from '@live911/shared';
import { describe, expect, it } from 'vitest';
import { T0, testRuntime } from './testing';

const sumTypes = (c: Record<string, number>): number => Object.values(c).reduce((a, b) => a + b, 0);

describe('Aggregator invariants', () => {
  const { rt, sim, setNow } = testRuntime(11);
  sim.prime(T0);
  setNow(T0 + 30_000);

  it('byType and byState both add up to active, and match the store', () => {
    const s = rt.aggregator.nationalSummary();
    expect(s.active).toBe(rt.store.activeCount);
    expect(sumTypes(s.byType)).toBe(s.active);
    expect(s.byState.reduce((a, st) => a + st.active, 0)).toBe(s.active);
    for (const st of s.byState) expect(sumTypes(st.byType)).toBe(st.active);
    expect(s.critical).toBe(rt.store.activeIncidents().filter((i) => i.priority === 1).length);
  });

  it('has a 60-point timeline whose per-type totals add up', () => {
    const s = rt.aggregator.nationalSummary();
    expect(s.timeline).toHaveLength(60);
    for (const p of s.timeline) expect(sumTypes(p.byType)).toBe(p.total);
    expect(s.timeline.slice(-30).some((p) => p.total > 0)).toBe(true);
    expect(s.ratePerMin).toBeGreaterThan(300);
    expect(s.avgResponseSec).toBeGreaterThan(30);
    expect(s.last24h).toBeGreaterThan(500_000);
  });

  it('state and city detail are consistent with the national view', () => {
    const s = rt.aggregator.nationalSummary();
    for (const st of s.byState) {
      const detail = rt.aggregator.stateDetail(st.code);
      expect(detail?.active).toBe(st.active);
      expect(detail?.cities.reduce((a, c) => a + c.active, 0)).toBe(st.active);
      for (const t of INCIDENT_TYPES) {
        expect(detail?.cities.reduce((a, c) => a + c.byType[t], 0)).toBe(st.byType[t]);
      }
    }
    expect(rt.aggregator.stateDetail('ZZ')).toBeUndefined();
    expect(rt.aggregator.citySummary('nowhere-xx')).toBeUndefined();
  });

  it('tracks active counts down as incidents resolve', () => {
    setNow(T0 + 3 * 3_600_000);
    const s = rt.aggregator.nationalSummary();
    expect(s.active).toBe(rt.store.activeCount);
    expect(sumTypes(s.byType)).toBe(s.active);
  });
});
