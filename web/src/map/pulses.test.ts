import { describe, expect, it } from 'vitest';
import { BIRTH_MS, FADE_MS, MAX_PULSES, PulseSet } from './pulses';
import { targetForSelection } from './selection-sync';
import { STATE_GEO } from './geo-data';

const base = { lng: 0, lat: 0, color: '#fff', critical: false };

describe('PulseSet', () => {
  it('cresce e svanisce, poi viene rimosso', () => {
    const p = new PulseSet();
    p.add({ ...base, kind: 'birth', start: 0 });
    const early = p.frames(100)[0];
    const late = p.frames(BIRTH_MS * 0.8)[0];
    expect(late && early && late.r > early.r).toBe(true);
    expect(late && early && late.o < early.o).toBe(true);
    expect(p.frames(BIRTH_MS + 1)).toEqual([]);
    expect(p.size).toBe(0);
  });
  it('fade rimpicciolisce', () => {
    const p = new PulseSet();
    p.add({ ...base, kind: 'fade', start: 0 });
    const a = p.frames(10)[0];
    const b = p.frames(FADE_MS * 0.9)[0];
    expect(a && b && b.r < a.r).toBe(true);
  });
  it('ha un tetto', () => {
    const p = new PulseSet();
    for (let i = 0; i < MAX_PULSES + 50; i++) p.add({ ...base, kind: 'birth', start: 0 });
    expect(p.size).toBe(MAX_PULSES);
  });
});

describe('geo-data / selection-sync', () => {
  it('51 codici unici', () => expect(new Set(STATE_GEO.map((s) => s.code)).size).toBe(51));
  const ctx = { cityPosition: (id: string) => (id === 'c' ? { lat: 1, lng: 2 } : undefined), incident: () => undefined };
  it('selezione vuota = bounds USA', () => expect(targetForSelection({}, ctx)?.kind).toBe('bounds'));
  it('stato e città', () => {
    expect(targetForSelection({ state: 'TX' }, ctx)).toMatchObject({ kind: 'center', center: [-99.3, 31.5] });
    expect(targetForSelection({ state: 'TX', cityId: 'c' }, ctx)).toMatchObject({ center: [2, 1] });
    expect(targetForSelection({ cityId: 'sconosciuta' }, ctx)).toBeNull();
  });
});
