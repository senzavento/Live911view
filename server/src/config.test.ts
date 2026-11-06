import { describe, expect, it } from 'vitest';
import { loadBasemap, loadConfig } from './config';

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
