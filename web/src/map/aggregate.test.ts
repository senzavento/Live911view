import { describe, expect, it } from 'vitest';
import type { Incident } from '@live911/shared';
import { Aggregator, bubbleRadius, dominantType, emptyCounts, formatCount, topTypes } from './aggregate';

const inc = (id: string, over: Partial<Incident> = {}): Incident => ({
  id, type: 'fire', priority: 3, status: 'dispatched', cityId: 'houston-tx', state: 'TX', lat: 29.7, lng: -95.3,
  address: 'a', description: 'd', unitsAssigned: 1, createdAt: '', updatedAt: '', ...over,
});

describe('dominantType', () => {
  it('null se vuoto', () => expect(dominantType(emptyCounts())).toBeNull());
  it('sceglie il massimo', () => expect(dominantType({ ...emptyCounts(), police: 3, fire: 1 })).toBe('police'));
  it('parità: ordine di INCIDENT_TYPES', () => expect(dominantType({ ...emptyCounts(), medical: 2, fire: 2 })).toBe('fire'));
  it('topTypes ordina per frequenza', () => expect(topTypes({ ...emptyCounts(), rescue: 1, hazmat: 5, fire: 2 })).toEqual(['hazmat', 'fire', 'rescue']));
});

describe('Aggregator', () => {
  it('aggrega create/update/resolve incrementalmente', () => {
    const a = new Aggregator();
    a.apply('created', inc('1'));
    a.apply('created', inc('2', { type: 'police', priority: 1 }));
    a.apply('created', inc('3', { cityId: 'dallas-tx', lat: 32.7, lng: -96.8 }));
    expect(a.states.get('TX')?.active).toBe(3);
    expect(a.states.get('TX')?.critical).toBe(1);
    expect(a.cities.get('houston-tx')?.byType.police).toBe(1);

    a.apply('updated', inc('2', { type: 'medical', priority: 3 }));
    expect(a.states.get('TX')?.critical).toBe(0);
    expect(a.states.get('TX')?.byType).toMatchObject({ police: 0, medical: 1, fire: 2 });
    expect(a.total).toBe(3);

    a.apply('resolved', inc('1'));
    expect(a.cities.get('houston-tx')?.active).toBe(1);
    expect(a.total).toBe(2);
  });

  it('ignora doppio created e resolved sconosciuto', () => {
    const a = new Aggregator();
    a.apply('created', inc('1'));
    a.apply('created', inc('1'));
    expect(a.states.get('TX')?.active).toBe(1);
    a.apply('resolved', inc('zzz'));
    expect(a.total).toBe(1);
  });

  it('segna sporchi solo i bucket toccati e tiene la media coordinate', () => {
    const a = new Aggregator();
    a.apply('created', inc('1', { lat: 10, lng: 20 }));
    a.apply('created', inc('2', { lat: 20, lng: 40 }));
    const c = a.cities.get('houston-tx');
    expect((c?.sumLat ?? 0) / (c?.active ?? 1)).toBe(15);
    a.dirtyCities.clear();
    a.apply('created', inc('3', { cityId: 'austin-tx' }));
    expect([...a.dirtyCities]).toEqual(['austin-tx']);
  });

  it('rebuild equivale all\'applicazione incrementale', () => {
    const list = [inc('1'), inc('2', { state: 'CA', cityId: 'la-ca' }), inc('3', { status: 'resolved' })];
    const a = new Aggregator();
    a.rebuild(list);
    expect(a.total).toBe(2);
    expect(a.states.get('CA')?.active).toBe(1);
  });
});

describe('utility', () => {
  it('raggio ∝ sqrt con tetto', () => {
    expect(bubbleRadius(0, 10, 3, 50)).toBe(10);
    expect(bubbleRadius(4, 10, 3, 50)).toBe(16);
    expect(bubbleRadius(1e6, 10, 3, 50)).toBe(50);
  });
  it('formatCount', () => {
    expect([formatCount(7), formatCount(999), formatCount(1000), formatCount(1250), formatCount(12400)]).toEqual(['7', '999', '1k', '1.3k', '12k']);
  });
});
