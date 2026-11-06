import { describe, expect, it } from 'vitest';
import { fmtAgo, fmtDayTime, fmtDelay, fmtDuration, fmtElapsed, fmtInt, fmtPct, fmtTime, fmtTimeTz, shortId, sfTzName, truncate } from './format';

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
  it('formatta il ritardo', () => {
    expect(fmtDelay(20)).toBe('< 1 min');
    expect(fmtDelay(15 * 60)).toBe('15 min');
    expect(fmtDelay(65 * 60)).toBe('1 h 05 min');
    expect(fmtDelay(Number.NaN)).toBe('–');
  });
  it('formatta il tempo trascorso', () => {
    expect(fmtElapsed(92_000)).toBe('01:32');
    expect(fmtElapsed(3_725_000)).toBe('1:02:05');
    expect(fmtElapsed(-5)).toBe('00:00');
  });
  it('converte in ora di San Francisco (PST, ora solare)', () => {
    // esempio del contratto: 2026-11-06T14:20:56 locale SF = 22:20:56Z
    expect(fmtTime('2026-11-06T22:20:56Z', true)).toBe('14:20:56');
    expect(fmtTime('2026-11-06T22:20:56Z')).toBe('14:20');
    expect(sfTzName('2026-11-06T22:20:56Z')).toBe('PST');
    expect(fmtTimeTz('2026-11-06T22:20:56Z')).toBe('14:20 PST');
  });
  it('rispetta l’ora legale (PDT) e il cambio ora', () => {
    expect(fmtTime('2026-07-06T21:20:56Z')).toBe('14:20');
    expect(sfTzName('2026-07-06T21:20:56Z')).toBe('PDT');
    // DST finisce il 1 nov 2026 alle 02:00 PDT = 09:00Z; 08:30Z è ancora PDT (01:30), 09:30Z è PST (01:30)
    expect(fmtTimeTz('2026-11-01T08:30:00Z')).toBe('01:30 PDT');
    expect(fmtTimeTz('2026-11-01T09:30:00Z')).toBe('01:30 PST');
    // mezzanotte UTC è ancora il giorno prima a SF
    expect(fmtDayTime('2026-11-06T03:05:00Z')).toBe('05/11, 19:05');
  });
  it('gestisce date non valide', () => {
    expect(fmtTime('boh')).toBe('–');
    expect(fmtTimeTz('boh')).toBe('–');
    expect(fmtDayTime('boh')).toBe('–');
    expect(fmtAgo('boh')).toBe('–');
  });
  it('formatta "fa"', () => {
    const now = Date.parse('2026-01-01T12:00:00Z');
    expect(fmtAgo('2026-01-01T11:59:58Z', now)).toBe('adesso');
    expect(fmtAgo('2026-01-01T11:57:00Z', now)).toBe('3 min fa');
    expect(fmtAgo('2026-01-01T09:00:00Z', now)).toBe('3 h fa');
  });
  it('percentuali, id corti e troncamento', () => {
    expect(fmtPct(1, 4)).toBe('25%');
    expect(fmtPct(1, 0)).toBe('0%');
    expect(shortId('261100123456')).toBe('#0123456');
    expect(shortId('42')).toBe('#42');
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abc', 4)).toBe('abc');
  });
});
