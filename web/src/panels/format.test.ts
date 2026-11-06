import { describe, expect, it } from 'vitest';
import { fmtAgo, fmtDuration, fmtElapsed, fmtInt, fmtPct, shortId } from './format';

describe('format', () => {
  it('formatta interi con separatore italiano', () => {
    expect(fmtInt(11400)).toBe('11.400');
    expect(fmtInt(Number.NaN)).toBe('–');
  });
  it('formatta durate', () => {
    expect(fmtDuration(45)).toBe('45 s');
    expect(fmtDuration(154)).toBe('2 min 34 s');
    expect(fmtDuration(3780)).toBe('1 h 03 min');
    expect(fmtDuration(-1)).toBe('–');
  });
  it('formatta il tempo trascorso', () => {
    expect(fmtElapsed(92_000)).toBe('01:32');
    expect(fmtElapsed(3_725_000)).toBe('1:02:05');
    expect(fmtElapsed(-5)).toBe('00:00');
  });
  it('formatta "fa"', () => {
    const now = Date.parse('2026-01-01T12:00:00Z');
    expect(fmtAgo('2026-01-01T11:59:58Z', now)).toBe('adesso');
    expect(fmtAgo('2026-01-01T11:57:00Z', now)).toBe('3 min fa');
    expect(fmtAgo('2026-01-01T09:00:00Z', now)).toBe('3 h fa');
  });
  it('percentuali e id corti', () => {
    expect(fmtPct(1, 4)).toBe('25%');
    expect(fmtPct(1, 0)).toBe('0%');
    expect(shortId('abcdefghij')).toBe('#efghij');
    expect(shortId('42')).toBe('#42');
  });
});
