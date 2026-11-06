import { describe, expect, it } from 'vitest';
import { BIRTH_MS, FADE_MS, MAX_PULSES, PulseSet } from './pulses';

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
