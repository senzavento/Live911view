import type { TimelinePoint, TypeCounts } from '@live911/shared';
import { describe, expect, it } from 'vitest';
import { stackSeries } from './stacked-area';

const counts = (o: Partial<TypeCounts>): TypeCounts => ({ fire: 0, medical: 0, police: 0, traffic: 0, hazmat: 0, rescue: 0, ...o });
const pt = (o: Partial<TypeCounts>): TimelinePoint => {
  const byType = counts(o);
  return { t: '2026-01-01T00:00:00Z', byType, total: Object.values(byType).reduce((a, b) => a + b, 0) };
};

describe('stackSeries', () => {
  it('serie vuota', () => {
    expect(stackSeries([], 100, 50)).toEqual({ paths: [], max: 0, xs: [] });
  });
  it('impila i tipi e calcola il massimo', () => {
    const r = stackSeries([pt({ fire: 2, medical: 1 }), pt({ fire: 4, medical: 2 })], 100, 54);
    expect(r.max).toBe(6);
    expect(r.paths).toHaveLength(6);
    expect(r.xs).toEqual([0, 100]);
    // il tipo più in alto arriva al margine superiore (y=4) nel punto di massimo
    expect(r.paths[5]?.d.startsWith('M0.0')).toBe(true);
    expect(r.paths[5]?.d).toContain('L100.0 4.0');
  });
  it('filtra su un solo tipo', () => {
    const r = stackSeries([pt({ fire: 2, medical: 9 }), pt({ fire: 1 })], 100, 54, 'fire');
    expect(r.paths.map((p) => p.type)).toEqual(['fire']);
    expect(r.max).toBe(2);
  });
  it('un solo punto non produce NaN', () => {
    const r = stackSeries([pt({ fire: 1 })], 100, 54);
    expect(r.paths[0]?.d).not.toContain('NaN');
  });
});
