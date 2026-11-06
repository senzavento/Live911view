import { describe, expect, it } from 'vitest';
import { sfLocalToUtc, utcToSfLocal } from './time';

const iso = (text: string): string | undefined => {
  const ms = sfLocalToUtc(text);
  return ms === undefined ? undefined : new Date(ms).toISOString();
};

describe('sfLocalToUtc', () => {
  it('converts PST (winter, UTC-8) and PDT (summer, UTC-7)', () => {
    expect(iso('2026-11-06T14:20:56.000')).toBe('2026-11-06T22:20:56.000Z');
    expect(iso('2026-07-01T12:00:00')).toBe('2026-07-01T19:00:00.000Z');
  });

  it('keeps milliseconds', () => {
    expect(iso('2026-11-06T14:20:56.123')).toBe('2026-11-06T22:20:56.123Z');
  });

  it('handles the March change (2026-03-08, 02:00 -> 03:00)', () => {
    expect(iso('2026-03-08T01:59:59')).toBe('2026-03-08T09:59:59.000Z'); // PST
    expect(iso('2026-03-08T03:00:00')).toBe('2026-03-08T10:00:00.000Z'); // PDT
    // 02:30 does not exist: shifted forward, never before the real 03:00
    expect(iso('2026-03-08T02:30:00')).toBe('2026-03-08T10:30:00.000Z');
  });

  it('handles the November change (2026-11-01, 02:00 -> 01:00)', () => {
    expect(iso('2026-11-01T00:59:59')).toBe('2026-11-01T07:59:59.000Z'); // PDT
    expect(iso('2026-11-01T01:30:00')).toBe('2026-11-01T08:30:00.000Z'); // ambiguous: first (PDT)
    expect(iso('2026-11-01T02:00:00')).toBe('2026-11-01T10:00:00.000Z'); // PST
  });

  it('crosses the UTC day boundary in both directions', () => {
    expect(iso('2026-12-31T16:00:00')).toBe('2027-01-01T00:00:00.000Z');
    expect(iso('2026-12-31T23:59:59')).toBe('2027-01-01T07:59:59.000Z');
    expect(iso('2026-06-15T00:00:00')).toBe('2026-06-15T07:00:00.000Z');
  });

  it.each(['', 'garbage', '2026-11-06', '2026-13-01T00:00:00', '2026-11-31T00:00:00', '2026-11-06T24:00:00', '2026-11-06T14:20:56Z'])(
    'rejects %j',
    (text) => expect(sfLocalToUtc(text)).toBeUndefined(),
  );
});

describe('utcToSfLocal', () => {
  it('is the inverse of sfLocalToUtc outside ambiguous hours', () => {
    for (const text of ['2026-11-06T14:20:56', '2026-07-01T12:00:00', '2026-03-08T03:00:00', '2026-12-31T23:59:59']) {
      expect(utcToSfLocal(sfLocalToUtc(text) as number)).toBe(text);
    }
  });
  it('formats across the day boundary', () => {
    expect(utcToSfLocal(Date.UTC(2027, 0, 1, 0, 0, 0))).toBe('2026-12-31T16:00:00');
    expect(utcToSfLocal(Date.UTC(2026, 10, 1, 9, 30, 0))).toBe('2026-11-01T01:30:00');
  });
});
