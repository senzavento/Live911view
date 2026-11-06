import { describe, expect, it } from 'vitest';
import { loadAppToken, loadBasemap, loadConfig } from './config';

const TILES = 'https://api.example.com/maps/{z}/{x}/{y}.png?key=secret';

describe('basemap config', () => {
  it('is null when unset', () => {
    expect(loadBasemap({})).toBeNull();
    expect(loadConfig({}).basemap).toBeNull();
  });
  it('parses a valid template with defaults', () => {
    expect(loadBasemap({ BASEMAP_TILES: TILES })).toMatchObject({ tiles: TILES, tileSize: 256, maxzoom: 18 });
  });
  it('accepts 512 tiles and a custom attribution', () => {
    expect(loadBasemap({ BASEMAP_TILES: TILES, BASEMAP_TILE_SIZE: '512', BASEMAP_ATTRIBUTION: '© me' }))
      .toMatchObject({ tileSize: 512, attribution: '© me' });
  });
  it.each([
    ['http', 'http://a.example.com/{z}/{x}/{y}.png'],
    ['no scheme', 'a.example.com/{z}/{x}/{y}.png'],
    ['missing {y}', 'https://a.example.com/{z}/{x}.png'],
  ])('rejects %s', (_n, tiles) => expect(() => loadBasemap({ BASEMAP_TILES: tiles })).toThrow());
  it('rejects odd tile sizes', () => {
    expect(() => loadBasemap({ BASEMAP_TILES: TILES, BASEMAP_TILE_SIZE: '300' })).toThrow();
  });
});

describe('source config', () => {
  it('has sane defaults and no simulator settings', () => {
    const c = loadConfig({});
    expect(c).toMatchObject({ pollSec: 120, socrataAppToken: undefined, port: 8787 });
    expect(c).not.toHaveProperty('simRate');
  });
  it('validates SF_POLL_SEC (30..3600)', () => {
    expect(loadConfig({ SF_POLL_SEC: '45' }).pollSec).toBe(45);
    for (const bad of ['29', '3601', 'abc']) expect(() => loadConfig({ SF_POLL_SEC: bad })).toThrow(/SF_POLL_SEC/);
  });
  it('accepts a header-safe token only', () => {
    expect(loadAppToken({ SOCRATA_APP_TOKEN: ' abc123 ' })).toBe('abc123');
    expect(loadAppToken({ SOCRATA_APP_TOKEN: '' })).toBeUndefined();
    expect(() => loadAppToken({ SOCRATA_APP_TOKEN: 'a\r\nX: y' })).toThrow();
  });
});
