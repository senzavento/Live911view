import type { AreaSummary, TypeCounts } from '@live911/shared';
import { describe, expect, it } from 'vitest';
import { areaValue, rankAreas } from './sidebar';
import { zeroCounts } from './scope';

const c = (o: Partial<TypeCounts>): TypeCounts => ({ ...zeroCounts(), ...o });
const area = (id: string, name: string, active: number, last24h: number, byType: Partial<TypeCounts>, critical = 0): AreaSummary => ({
  id, name, lat: 0, lng: 0, active, last24h, critical, byType: c(byType),
});
const areas = [
  area('mission', 'Mission', 40, 300, { property: 10, proactive: 30 }, 3),
  area('tenderloin', 'Tenderloin', 30, 500, { violent: 10, disturbance: 20 }),
  area('sunset', 'Sunset/Parkside', 5, 90, { alarm: 5 }),
];

describe('rankAreas', () => {
  it('ordina per attive o per ultime 24 h', () => {
    expect(rankAreas(areas, 'active', null, '').map((r) => r.key)).toEqual(['mission', 'tenderloin', 'sunset']);
    expect(rankAreas(areas, 'last24h', null, '').map((r) => r.key)).toEqual(['tenderloin', 'mission', 'sunset']);
  });
  it('nascondere proactive cambia la classifica delle attive', () => {
    expect(rankAreas(areas, 'active', null, '', undefined, true).map((r) => r.key)).toEqual(['tenderloin', 'mission', 'sunset']);
    expect(areaValue(areas[0] as AreaSummary, 'active', null, true)).toBe(10);
    expect(areaValue(areas[0] as AreaSummary, 'last24h', null, true)).toBe(300); // non scomponibile
  });
  it('filtro categoria e ricerca', () => {
    expect(rankAreas(areas, 'active', 'violent', '').map((r) => r.key)[0]).toBe('tenderloin');
    expect(rankAreas(areas, 'active', null, 'sun').map((r) => r.key)).toEqual(['sunset']);
    expect(rankAreas(areas, 'active', null, 'zzz')).toEqual([]);
  });
  it('normalizza le barre e marca il quartiere corrente', () => {
    const r = rankAreas(areas, 'active', null, '', 'tenderloin');
    expect(r[0]?.pct).toBe(100);
    expect(r[1]?.current).toBe(true);
    expect(r[0]?.tag).toBe('3 critiche');
  });
});
