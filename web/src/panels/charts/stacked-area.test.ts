import type { TimelinePoint, TypeCounts } from '@live911/shared';
import { describe, expect, it } from 'vitest';
import { zeroCounts } from '../scope';
import { peakOf, stackSeries } from './stacked-area';

const counts = (o: Partial<TypeCounts>): TypeCounts => ({ ...zeroCounts(), ...o });
const pt = (o: Partial<TypeCounts>, t = '2026-01-01T00:00:00Z'): TimelinePoint => {
  const byType = counts(o);
  return { t, byType, total: Object.values(byType).reduce((a, b) => a + b, 0) };
};

describe('stackSeries', () => {
  it('serie vuota', () => {
    expect(stackSeries([], 100, 50)).toEqual({ paths: [], max: 0, xs: [] });
  });
  it('impila le 8 categorie e calcola il massimo', () => {
    const r = stackSeries([pt({ violent: 2, property: 1 }), pt({ violent: 4, property: 2 })], 100, 54);
    expect(r.max).toBe(6);
    expect(r.paths).toHaveLength(8);
    expect(r.xs).toEqual([0, 100]);
    expect(r.paths[7]?.d).toContain('L100.0 4.0');
  });
  it('esclude le categorie non richieste (es. proactive nascosta)', () => {
    const r = stackSeries([pt({ violent: 2, proactive: 9 }), pt({ violent: 1 })], 100, 54, ['violent']);
    expect(r.paths.map((p) => p.type)).toEqual(['violent']);
    expect(r.max).toBe(2);
  });
  it('un solo punto non produce NaN', () => {
    const r = stackSeries([pt({ violent: 1 })], 100, 54);
    expect(r.paths[0]?.d).not.toContain('NaN');
  });
  it('trova il picco', () => {
    expect(peakOf([])).toBeNull();
    expect(peakOf([pt({}), pt({ alarm: 3 }, 'b'), pt({ alarm: 2 }, 'c')])).toEqual({ t: 'b', total: 3 });
  });
});
