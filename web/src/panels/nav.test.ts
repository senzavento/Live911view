import { describe, expect, it } from 'vitest';
import { backLabel, buildCrumbs, levelOf, normalizeSelection, parentSelection, selectionKey } from './nav';

const lookup = (id: string) => (id === 'c1' ? { areaId: 'mission', intersectionId: 'mission-0' } : undefined);

describe('nav', () => {
  it('completa selezioni parziali dalla chiamata nota', () => {
    expect(normalizeSelection({})).toEqual({});
    expect(normalizeSelection({ incidentId: 'c1' }, lookup)).toEqual({ areaId: 'mission', intersectionId: 'mission-0', incidentId: 'c1' });
    expect(normalizeSelection({ areaId: 'soma', incidentId: 'c1' }, lookup).areaId).toBe('soma');
    // chiamata sconosciuta: resta selezionata, i livelli superiori mancano
    expect(normalizeSelection({ incidentId: 'zz' }, lookup)).toEqual({ incidentId: 'zz' });
  });
  it('calcola il livello', () => {
    expect(levelOf({})).toBe(0);
    expect(levelOf({ areaId: 'mission' })).toBe(1);
    expect(levelOf({ areaId: 'mission', intersectionId: 'x' })).toBe(2);
    expect(levelOf({ areaId: 'mission', intersectionId: 'x', incidentId: 'c' })).toBe(3);
  });
  it('costruisce il breadcrumb cliccabile San Francisco › Quartiere › Incrocio › Chiamata', () => {
    const sel = { areaId: 'mission', intersectionId: 'mission-0', incidentId: 'c1' };
    const c = buildCrumbs(sel, { area: 'Mission', intersection: 'MISSION ST \\ 16TH ST', incident: 'Furto #c1' });
    expect(c.map((x) => x.label)).toEqual(['San Francisco', 'Mission', 'MISSION ST \\ 16TH ST', 'Furto #c1']);
    expect(c.map((x) => x.current)).toEqual([false, false, false, true]);
    expect(c[0]?.target).toEqual({});
    expect(c[1]?.target).toEqual({ areaId: 'mission' });
    expect(c[2]?.target).toEqual({ areaId: 'mission', intersectionId: 'mission-0' });
    expect(buildCrumbs({}).map((x) => x.label)).toEqual(['San Francisco']);
    expect(buildCrumbs({ areaId: 'mission' })[1]?.label).toBe('mission'); // fallback senza nome
  });
  it('seleziona il livello superiore', () => {
    expect(parentSelection({ areaId: 'a', intersectionId: 'i', incidentId: 'c' })).toEqual({ areaId: 'a', intersectionId: 'i' });
    expect(parentSelection({ areaId: 'a', intersectionId: 'i' })).toEqual({ areaId: 'a' });
    expect(parentSelection({ areaId: 'a' })).toEqual({});
    expect(parentSelection({ incidentId: 'c' })).toEqual({});
    expect(parentSelection({})).toEqual({});
  });
  it('chiave ed etichetta Indietro', () => {
    expect(selectionKey({ areaId: 'a', incidentId: 'c' })).toBe('a||c');
    expect(backLabel(3, true)).toBe('← Incrocio');
    expect(backLabel(2, true)).toBe('← Quartiere');
    expect(backLabel(1, true)).toBe('← San Francisco');
  });
});
