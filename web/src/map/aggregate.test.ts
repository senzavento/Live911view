import { describe, expect, it } from 'vitest';
import type { Incident } from '@live911/shared';
import { Aggregator, bubbleRadius, bucketCentroid, dominantType, emptyCounts, formatCount, topTypes } from './aggregate';

const inc = (id: string, over: Partial<Incident> = {}): Incident => ({
  id, type: 'violent', priority: 3, status: 'dispatched', areaId: 'mission', areaName: 'Mission', intersectionId: 'x1',
  address: 'MISSION ST \\ 16TH ST', lat: 37.76, lng: -122.42, description: 'd', agency: 'Police', officerInitiated: false,
  createdAt: '', updatedAt: '', ...over,
});

describe('dominantType', () => {
  it('null se vuoto', () => expect(dominantType(emptyCounts())).toBeNull());
  it('sceglie il massimo', () => expect(dominantType({ ...emptyCounts(), traffic: 3, violent: 1 })).toBe('traffic'));
  it('parità: ordine di INCIDENT_TYPES', () => expect(dominantType({ ...emptyCounts(), welfare: 2, property: 2 })).toBe('property'));
  it('topTypes ordina per frequenza', () => expect(topTypes({ ...emptyCounts(), alarm: 1, proactive: 5, violent: 2 })).toEqual(['proactive', 'violent', 'alarm']));
});

describe('Aggregator', () => {
  it('aggrega create/update/resolve incrementalmente per quartiere e incrocio', () => {
    const a = new Aggregator();
    a.apply('created', inc('1'));
    a.apply('created', inc('2', { type: 'traffic', priority: 1 }));
    a.apply('created', inc('3', { areaId: 'soma', areaName: 'SoMa', intersectionId: 'x2' }));
    expect(a.areas.get('mission')?.active).toBe(2);
    expect(a.areas.get('mission')?.critical).toBe(1);
    expect(a.intersections.get('x1')?.byType.traffic).toBe(1);
    expect(a.intersections.get('x2')?.areaId).toBe('soma');

    a.apply('updated', inc('2', { type: 'alarm', priority: 3 }));
    expect(a.areas.get('mission')?.critical).toBe(0);
    expect(a.areas.get('mission')?.byType).toMatchObject({ traffic: 0, alarm: 1, violent: 1 });
    expect(a.total).toBe(3);

    a.apply('resolved', inc('1'));
    expect(a.intersections.get('x1')?.active).toBe(1);
    expect(a.total).toBe(2);
  });

  it('elimina i bucket vuoti', () => {
    const a = new Aggregator();
    a.apply('created', inc('1'));
    a.apply('resolved', inc('1'));
    expect(a.areas.size).toBe(0);
    expect(a.intersections.size).toBe(0);
  });

  it('ignora doppio created e resolved sconosciuto; status resolved non conta', () => {
    const a = new Aggregator();
    a.apply('created', inc('1'));
    a.apply('created', inc('1'));
    expect(a.areas.get('mission')?.active).toBe(1);
    a.apply('resolved', inc('zzz'));
    a.apply('updated', inc('2', { status: 'resolved' }));
    expect(a.total).toBe(1);
  });

  it('un update può spostare la chiamata in un altro incrocio', () => {
    const a = new Aggregator();
    a.apply('created', inc('1'));
    a.apply('updated', inc('1', { intersectionId: 'x9', address: 'B' }));
    expect(a.intersections.has('x1')).toBe(false);
    expect(a.intersections.get('x9')?.name).toBe('B');
    expect(a.areas.get('mission')?.active).toBe(1);
  });

  it('tiene la media delle coordinate', () => {
    const a = new Aggregator();
    a.apply('created', inc('1', { lat: 10, lng: 20 }));
    a.apply('created', inc('2', { lat: 20, lng: 40 }));
    expect(bucketCentroid(a.areas.get('mission')!)).toEqual({ lat: 15, lng: 30 });
  });

  it("rebuild equivale all'applicazione incrementale", () => {
    const list = [inc('1'), inc('2', { areaId: 'soma' }), inc('3', { status: 'resolved' })];
    const a = new Aggregator();
    a.rebuild(list);
    expect(a.total).toBe(2);
    expect(a.areas.get('soma')?.active).toBe(1);
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
