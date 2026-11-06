import type { SourceStatus } from '@live911/shared';
import { describe, expect, it } from 'vitest';
import { safeUrl, sourceHealth } from './source';

const now = Date.parse('2026-11-06T22:35:00Z');
const base: SourceStatus = {
  name: 'DataSF',
  url: 'https://data.sf.gov/resource/gnap-fj3t.json',
  license: 'PDDL',
  dataAsOf: '2026-11-06T22:20:00Z',
  delaySec: 900,
  lastPollAt: '2026-11-06T22:34:00Z',
  ok: true,
};

describe('sourceHealth', () => {
  it('ok con ritardo normale, calcolato da dataAsOf', () => {
    const h = sourceHealth(base, now);
    expect(h.state).toBe('ok');
    expect(h.delaySec).toBe(900);
    expect(h.asOfText).toBe('Dati delle 14:20 PST');
  });
  it('il ritardo cresce anche se il server tace: oltre 30 min è obsoleto', () => {
    expect(sourceHealth(base, now + 10 * 60_000).state).toBe('ok'); // 25 min
    const h = sourceHealth(base, now + 20 * 60_000); // 35 min
    expect(h.state).toBe('stale');
    expect(h.label).toBe('Dati obsoleti');
  });
  it('ok=false è errore, con testo esplicativo e messaggio troncato', () => {
    const h = sourceHealth({ ...base, ok: false, lastError: 'x'.repeat(500) }, now);
    expect(h.state).toBe('error');
    expect(h.label).toBe('Errore sorgente');
    expect(h.detail.length).toBeLessThan(400);
  });
  it('errore + vecchio: segnala anche l’obsolescenza', () => {
    const h = sourceHealth({ ...base, ok: false }, now + 3600_000);
    expect(h.state).toBe('error');
    expect(h.detail).toContain('obsoleti');
  });
  it('senza dati: in attesa', () => {
    expect(sourceHealth(null, now).state).toBe('pending');
    expect(sourceHealth({ ...base, dataAsOf: null, delaySec: null }, now).state).toBe('pending');
  });
});

describe('safeUrl', () => {
  it('accetta solo http(s)', () => {
    expect(safeUrl('https://data.sf.gov/x', 'f')).toBe('https://data.sf.gov/x');
    expect(safeUrl('javascript:alert(1)', 'f')).toBe('f');
    expect(safeUrl(undefined, 'f')).toBe('f');
  });
});
