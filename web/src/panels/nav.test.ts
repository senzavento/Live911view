import type { Incident } from '@live911/shared';
import { describe, expect, it } from 'vitest';
import { buildCrumbs, levelOf, normalizeSelection, parentSelection, stateOfCityId } from './nav';

const inc = { id: 'i1', state: 'TX', cityId: 'houston-tx' } as Incident;
const incidents = new Map([[inc.id, inc]]);

describe('nav', () => {
  it('ricava lo stato dallo slug città', () => {
    expect(stateOfCityId('new-york-ny')).toBe('NY');
    expect(stateOfCityId('x')).toBeUndefined();
  });
  it('normalizza selezioni parziali', () => {
    expect(normalizeSelection({}, incidents)).toEqual({});
    expect(normalizeSelection({ cityId: 'houston-tx' }, incidents)).toEqual({ state: 'TX', cityId: 'houston-tx' });
    expect(normalizeSelection({ incidentId: 'i1' }, incidents)).toEqual({ state: 'TX', cityId: 'houston-tx', incidentId: 'i1' });
    // incidente sconosciuto e senza città: livello inferiore scartato
    expect(normalizeSelection({ state: 'TX', incidentId: 'zz' }, incidents)).toEqual({ state: 'TX' });
  });
  it('calcola il livello', () => {
    expect(levelOf({})).toBe(0);
    expect(levelOf({ state: 'TX' })).toBe(1);
    expect(levelOf({ state: 'TX', cityId: 'a-tx' })).toBe(2);
    expect(levelOf({ state: 'TX', cityId: 'a-tx', incidentId: 'i' })).toBe(3);
  });
  it('costruisce il breadcrumb cliccabile', () => {
    const sel = { state: 'TX', cityId: 'houston-tx', incidentId: 'i1' };
    const c = buildCrumbs(sel, { state: 'Texas', city: 'Houston', incident: 'Incendio #1' });
    expect(c.map((x) => x.label)).toEqual(['USA', 'Texas', 'Houston', 'Incendio #1']);
    expect(c.map((x) => x.current)).toEqual([false, false, false, true]);
    expect(c[0]?.target).toEqual({});
    expect(c[1]?.target).toEqual({ state: 'TX' });
    expect(c[2]?.target).toEqual({ state: 'TX', cityId: 'houston-tx' });
    expect(buildCrumbs({}).map((x) => x.label)).toEqual(['USA']);
    expect(buildCrumbs({ state: 'TX' })[1]?.label).toBe('TX'); // fallback senza nome
  });
  it('seleziona il livello superiore', () => {
    expect(parentSelection({ state: 'TX', cityId: 'a-tx', incidentId: 'i' })).toEqual({ state: 'TX', cityId: 'a-tx' });
    expect(parentSelection({ state: 'TX', cityId: 'a-tx' })).toEqual({ state: 'TX' });
    expect(parentSelection({ state: 'TX' })).toEqual({});
    expect(parentSelection({})).toEqual({});
  });
});
