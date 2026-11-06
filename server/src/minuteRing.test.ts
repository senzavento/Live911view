import { describe, expect, it } from 'vitest';
import { MinuteRing, WINDOW_MINUTES } from './minuteRing';

const MIN = 60_000;

describe('MinuteRing', () => {
  it('keeps a running 24h total and expires old minutes', () => {
    const ring = new MinuteRing(2);
    ring.add(0, 0, 5);
    ring.add(0, 10 * MIN, 3);
    expect(ring.total(0, 10 * MIN)).toBe(8);
    expect(ring.total(0, WINDOW_MINUTES * MIN)).toBe(3);
    expect(ring.total(0, (WINDOW_MINUTES + 10) * MIN)).toBe(0);
  });

  it('returns a zero-padded series ending at the current minute', () => {
    const ring = new MinuteRing(1);
    ring.add(0, 100 * MIN, 2);
    ring.add(0, 102 * MIN, 4);
    expect(ring.series(0, 102 * MIN, 4)).toEqual([0, 2, 0, 4]);
  });

  it('ignores writes older than the window', () => {
    const ring = new MinuteRing(1);
    ring.add(0, 5000 * MIN, 1);
    ring.add(0, 1 * MIN, 9);
    expect(ring.total(0, 5000 * MIN)).toBe(1);
  });
});
