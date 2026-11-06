import { describe, expect, it } from 'vitest';
import { incident } from './fixtures';
import { IncidentStore } from './store';
import { T0 } from './testing';

const HOUR = 3_600_000;
const win = (incidents: ReturnType<typeof incident>[], unlocated: { id: string; receivedMs: number }[] = []) => ({
  kind: 'window' as const,
  windowStartMs: T0 - 48 * HOUR,
  incidents,
  unlocated,
});

describe('IncidentStore.sync', () => {
  it('emits nothing on the first load', () => {
    const store = new IncidentStore(() => T0);
    expect(store.sync(win([incident({ id: 'a' }, T0 - HOUR)]))).toEqual([]);
    expect(store.activeIncidents()).toHaveLength(1);
  });

  it('emits created / updated / resolved against the stored state', () => {
    const store = new IncidentStore(() => T0);
    const a = incident({ id: 'a' }, T0 - HOUR);
    store.sync(win([a]));

    const created = store.sync(win([a, incident({ id: 'b' }, T0 - 60_000)]));
    expect(created.map((c) => [c.event, c.data.id])).toEqual([['incident.created', 'b']]);

    const onScene = { ...a, status: 'on_scene' as const, updatedAt: new Date(T0).toISOString() };
    expect(store.sync(win([onScene, incident({ id: 'b' }, T0 - 60_000)])).map((c) => [c.event, c.data.id])).toEqual([['incident.updated', 'a']]);

    const closed = { ...onScene, status: 'resolved' as const, resolvedAt: new Date(T0).toISOString() };
    expect(store.sync(win([closed, incident({ id: 'b' }, T0 - 60_000)])).map((c) => [c.event, c.data.id])).toEqual([['incident.resolved', 'a']]);

    // unchanged window: silent
    expect(store.sync(win([closed, incident({ id: 'b' }, T0 - 60_000)]))).toEqual([]);
    expect(store.activeIncidents().map((i) => i.id)).toEqual(['b']);
  });

  it('does not announce calls that first appear already resolved', () => {
    const store = new IncidentStore(() => T0);
    store.sync(win([incident({ id: 'a' }, T0 - HOUR)]));
    const done = incident({ id: 'z', status: 'resolved', resolvedAt: new Date(T0).toISOString() }, T0 - 2 * HOUR);
    expect(store.sync(win([incident({ id: 'a' }, T0 - HOUR), done]))).toEqual([]);
    expect(store.get('z')?.status).toBe('resolved');
  });

  it('closes active calls the source stopped listing, but not when it returned nothing at all', () => {
    const store = new IncidentStore(() => T0);
    const a = incident({ id: 'a' }, T0 - HOUR);
    const b = incident({ id: 'b' }, T0 - HOUR);
    store.sync(win([a, b]));
    expect(store.sync(win([a, incident({ id: 'c' }, T0 - 30_000)])).map((c) => [c.event, c.data.id])).toEqual([
      ['incident.created', 'c'],
      ['incident.resolved', 'b'],
    ]);
    expect(store.get('b')).toBeUndefined();
    expect(store.sync(win([]))).toEqual([]);
    expect(store.get('a')).toBeDefined();
  });

  it('drops calls older than 48 h', () => {
    let now = T0;
    const store = new IncidentStore(() => now);
    store.sync(win([incident({ id: 'a' }, T0 - 47 * HOUR)], [{ id: 'u', receivedMs: T0 - 47 * HOUR }]));
    now = T0 + 2 * HOUR;
    store.prune();
    expect(store.get('a')).toBeUndefined();
    expect([...store.unlocated()]).toEqual([]);
  });

  it('keeps areas once seen, with centroids from observed positions', () => {
    const store = new IncidentStore(() => T0);
    store.sync(win([
      incident({ id: 'a', lat: 37.7, lng: -122.4 }, T0 - HOUR),
      incident({ id: 'b', lat: 37.8, lng: -122.5 }, T0 - HOUR),
    ]));
    expect(store.area('mission')).toMatchObject({ lat: 37.75, lng: -122.45 });
    store.sync(win([incident({ id: 'x', areaId: 'soma', areaName: 'SoMa' }, T0 - HOUR)]));
    expect(store.areas().map((a) => a.id)).toEqual(['mission', 'soma']);
  });

  it('filters and orders queries', () => {
    const store = new IncidentStore(() => T0);
    store.sync(win([
      incident({ id: 'old', type: 'violent' }, T0 - 3 * HOUR),
      incident({ id: 'new', type: 'violent', intersectionId: '7' }, T0 - HOUR),
      incident({ id: 'done', type: 'violent', status: 'resolved' }, T0 - HOUR),
    ]));
    expect(store.query({}, 10).map((i) => i.id)).toEqual(['new', 'old']);
    expect(store.query({ status: 'resolved' }, 10).map((i) => i.id)).toEqual(['done']);
    expect(store.query({ intersectionId: '7' }, 10).map((i) => i.id)).toEqual(['new']);
    expect(store.query({ type: 'alarm' }, 10)).toEqual([]);
    expect(store.query({}, 1)).toHaveLength(1);
  });
});
