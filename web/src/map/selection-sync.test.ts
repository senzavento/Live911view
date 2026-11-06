import { describe, expect, it } from 'vitest';
import { SF_BOUNDS } from '@live911/shared';
import type { Incident } from '@live911/shared';
import { targetForSelection } from './selection-sync';

const incident = { id: 'i', lat: 37.7, lng: -122.4 } as Incident;
const ctx = (zoom = 11) => ({
  areaPosition: (id: string) => (id === 'a' ? { lat: 1, lng: 2 } : undefined),
  intersectionPosition: (id: string) => (id === 'x' ? { lat: 3, lng: 4 } : undefined),
  incident: (id: string) => (id === 'i' ? incident : undefined),
  currentZoom: zoom,
});

describe('targetForSelection', () => {
  it('selezione vuota = SF_BOUNDS', () => expect(targetForSelection({}, ctx())).toEqual({ kind: 'bounds', bounds: SF_BOUNDS }));
  it('quartiere', () => expect(targetForSelection({ areaId: 'a' }, ctx())).toMatchObject({ center: [2, 1], zoom: 13.3 }));
  it('incrocio: zoom almeno 16, senza ridurre uno zoom maggiore', () => {
    expect(targetForSelection({ areaId: 'a', intersectionId: 'x' }, ctx())).toMatchObject({ center: [4, 3], zoom: 16 });
    expect(targetForSelection({ areaId: 'a', intersectionId: 'x' }, ctx(17.5))).toMatchObject({ zoom: 17.5 });
  });
  it('chiamata', () => expect(targetForSelection({ incidentId: 'i' }, ctx())).toMatchObject({ center: [-122.4, 37.7], zoom: 16.5 }));
  it('non risolvibile -> null, ma ricade sul livello superiore', () => {
    expect(targetForSelection({ areaId: 'zzz' }, ctx())).toBeNull();
    expect(targetForSelection({ areaId: 'a', incidentId: 'gone' }, ctx())).toMatchObject({ center: [2, 1] });
  });
});
