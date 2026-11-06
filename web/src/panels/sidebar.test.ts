import type { StateSummary, TypeCounts } from '@live911/shared';
import { describe, expect, it } from 'vitest';
import { rankStates, stateValue } from './sidebar';

const c = (o: Partial<TypeCounts>): TypeCounts => ({ fire: 0, medical: 0, police: 0, traffic: 0, hazmat: 0, rescue: 0, ...o });
const states: StateSummary[] = [
  { code: 'TX', name: 'Texas', active: 40, critical: 3, byType: c({ fire: 10, medical: 30 }), per100k: 0.13 },
  { code: 'WY', name: 'Wyoming', active: 5, critical: 0, byType: c({ fire: 5 }), per100k: 0.86 },
  { code: 'CA', name: 'California', active: 30, critical: 1, byType: c({ fire: 20, police: 10 }), per100k: 0.07 },
];

describe('rankStates', () => {
  it('ordina per attivi o per 100k', () => {
    expect(rankStates(states, 'active', null, '').map((r) => r.key)).toEqual(['TX', 'CA', 'WY']);
    expect(rankStates(states, 'per100k', null, '').map((r) => r.key)).toEqual(['WY', 'TX', 'CA']);
  });
  it('applica filtro tipo e ricerca', () => {
    expect(rankStates(states, 'active', 'fire', '').map((r) => r.key)).toEqual(['CA', 'TX', 'WY']);
    expect(rankStates(states, 'active', null, 'cal').map((r) => r.key)).toEqual(['CA']);
    expect(rankStates(states, 'active', null, 'wy').map((r) => r.key)).toEqual(['WY']);
    expect(rankStates(states, 'active', null, 'zzz')).toEqual([]);
  });
  it('normalizza le barre e marca lo stato corrente', () => {
    const r = rankStates(states, 'active', null, '', 'CA');
    expect(r[0]?.pct).toBe(100);
    expect(r[1]?.current).toBe(true);
  });
  it('scala per100k con filtro tipo', () => {
    const tx = states[0] as StateSummary;
    expect(stateValue(tx, 'per100k', 'fire')).toBeCloseTo(0.13 * 0.25);
  });
});
