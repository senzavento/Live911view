import { describe, expect, it } from 'vitest';
import { parseBasemap } from './basemap';

const ok = { tiles: 'https://t.example.com/{z}/{x}/{y}.png?key=k', tileSize: 256, maxzoom: 18, attribution: '© x' };

describe('parseBasemap', () => {
  it('accepts a valid config', () => expect(parseBasemap({ basemap: ok })).toEqual(ok));
  it('null / missing means no basemap', () => {
    expect(parseBasemap({ basemap: null })).toBeNull();
    expect(parseBasemap(null)).toBeNull();
    expect(parseBasemap({})).toBeNull();
  });
  it.each([
    ['http url', { ...ok, tiles: 'http://t.example.com/{z}/{x}/{y}.png' }],
    ['javascript url', { ...ok, tiles: 'javascript:alert(1)//{z}{x}{y}' }],
    ['missing placeholder', { ...ok, tiles: 'https://t.example.com/{z}/{x}.png' }],
    ['bad tile size', { ...ok, tileSize: 300 }],
    ['bad maxzoom', { ...ok, maxzoom: 'x' }],
    ['bad attribution', { ...ok, attribution: 1 }],
  ])('rejects %s', (_n, bad) => expect(parseBasemap({ basemap: bad })).toBeNull());
});
