import type { Incident } from '@live911/shared';
import { describe, expect, it } from 'vitest';
import { IncidentStore } from './store';

const make = (id: string, status: Incident['status'] = 'dispatched'): Incident => ({
  id, type: 'fire', priority: 2, status, cityId: 'houston-tx', state: 'TX', lat: 0, lng: 0,
  address: 'x', description: 'x', unitsAssigned: 1, createdAt: 'a', updatedAt: 'a',
});

describe('IncidentStore', () => {
  it('bounds resolved history and drops evicted ids', () => {
    const store = new IncidentStore(3);
    for (let i = 0; i < 5; i++) {
      store.apply({ kind: 'created', incident: make(`i${i}`) });
      store.apply({ kind: 'resolved', incident: make(`i${i}`, 'resolved') });
    }
    expect(store.activeCount).toBe(0);
    expect(store.get('i0')).toBeUndefined();
    expect(store.get('i4')).toBeDefined();
    expect(store.query({ status: 'resolved' }, 10).map((i) => i.id)).toEqual(['i4', 'i3', 'i2']);
  });

  it('returns the previous version on update', () => {
    const store = new IncidentStore();
    expect(store.apply({ kind: 'created', incident: make('a') })).toBeUndefined();
    expect(store.apply({ kind: 'updated', incident: make('a', 'on_scene') })?.status).toBe('dispatched');
  });
});
