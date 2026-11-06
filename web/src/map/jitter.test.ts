import { describe, expect, it } from 'vitest';
import { JITTER_MAX_M, hashId, jitterMeters, jitteredPosition } from './jitter';

describe('jitter', () => {
  it('è deterministico', () => {
    expect(jitteredPosition('2610001234', -122.4, 37.76)).toEqual(jitteredPosition('2610001234', -122.4, 37.76));
    expect(hashId('a')).not.toBe(hashId('b'));
  });
  it('resta entro ~15 m e distribuisce ids diversi in punti diversi', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 500; k++) {
      const id = `P26${100000 + k}`;
      const { east, north } = jitterMeters(id);
      expect(Math.hypot(east, north)).toBeLessThanOrEqual(JITTER_MAX_M + 1e-9);
      seen.add(`${east.toFixed(2)},${north.toFixed(2)}`);
    }
    expect(seen.size).toBeGreaterThan(480);
  });
  it('lo spostamento in gradi corrisponde a metri reali', () => {
    const [lng, lat] = jitteredPosition('x', -122.4, 37.76);
    const dy = (lat - 37.76) * 111_320;
    const dx = (lng + 122.4) * 111_320 * Math.cos((37.76 * Math.PI) / 180);
    expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(JITTER_MAX_M + 0.01);
    expect(Math.hypot(dx, dy)).toBeGreaterThan(2.9);
  });
});
