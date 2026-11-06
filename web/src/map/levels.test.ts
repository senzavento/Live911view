import { describe, expect, it } from 'vitest';
import { describeView, levelForZoom } from './levels';

describe('levelForZoom', () => {
  it('soglie 4.5 e 8', () => {
    expect(levelForZoom(2)).toBe('state');
    expect(levelForZoom(4.49)).toBe('state');
    expect(levelForZoom(4.5)).toBe('city');
    expect(levelForZoom(7.99)).toBe('city');
    expect(levelForZoom(8)).toBe('incident');
  });
  it('città selezionata anticipa i singoli incidenti', () => {
    expect(levelForZoom(6.5, { cityId: 'x' })).toBe('incident');
    expect(levelForZoom(5, { cityId: 'x' })).toBe('city');
    expect(levelForZoom(6.5, { state: 'TX' })).toBe('city');
  });
});

describe('describeView', () => {
  it('etichette', () => {
    expect(describeView('state')).toBe('Nazionale');
    expect(describeView('city', { state: 'TX' })).toBe('Stato');
    expect(describeView('incident', { cityId: 'h' })).toBe('Città');
    expect(describeView('incident', { cityId: 'h', incidentId: 'i' })).toBe('Incidente');
    expect(describeView('incident')).toBe('Incidente');
  });
});
