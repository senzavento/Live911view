import { describe, expect, it } from 'vitest';
import { describeView, levelForZoom } from './levels';

describe('levelForZoom', () => {
  it('soglie 12.5 e 15', () => {
    expect(levelForZoom(10.5)).toBe('area');
    expect(levelForZoom(12.49)).toBe('area');
    expect(levelForZoom(12.5)).toBe('intersection');
    expect(levelForZoom(14.99)).toBe('intersection');
    expect(levelForZoom(15)).toBe('incident');
  });
  it('incrocio o chiamata selezionati mostrano le chiamate da 12.5', () => {
    expect(levelForZoom(13, { areaId: 'a', intersectionId: 'x' })).toBe('incident');
    expect(levelForZoom(13, { incidentId: 'i' })).toBe('incident');
    expect(levelForZoom(13, { areaId: 'a' })).toBe('intersection');
    expect(levelForZoom(11, { intersectionId: 'x' })).toBe('area');
  });
});

describe('describeView', () => {
  it('etichette', () => {
    expect(describeView('area')).toBe('Città');
    expect(describeView('area', { areaId: 'a' })).toBe('Quartiere');
    expect(describeView('intersection', { areaId: 'a' })).toBe('Quartiere');
    expect(describeView('incident', { intersectionId: 'x' })).toBe('Incrocio');
    expect(describeView('incident', { intersectionId: 'x', incidentId: 'i' })).toBe('Chiamata');
    expect(describeView('incident')).toBe('Chiamata');
  });
});
