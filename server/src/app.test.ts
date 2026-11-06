import type { AddressInfo } from 'node:net';
import type { AreaDetail, AreaInfo, CitySummary, Incident, IntersectionDetail } from '@live911/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { incident } from './fixtures';
import { STALE_AFTER_MS } from './runtime';
import { T0, testApp, testRuntime } from './testing';

const HOUR = 3_600_000;
const { rt, source, setNow } = testRuntime();
const app = await testApp(rt);
const rows: Incident[] = [
  incident({ id: '1', type: 'violent', priority: 1, status: 'on_scene' }, T0 - HOUR),
  incident({ id: '2', type: 'traffic', areaId: 'soma', areaName: 'SoMa', intersectionId: '200', address: 'X ST \\ Y ST' }, T0 - 2 * HOUR),
  incident({ id: '3', status: 'resolved', resolvedAt: new Date(T0).toISOString() }, T0 - 3 * HOUR),
];
source.push({ incidents: rows, unlocated: [{ id: 'u1', receivedMs: T0 - HOUR }, { id: 'u2', receivedMs: T0 - 2 * HOUR }] });

describe('API', () => {
  it('health reflects poll freshness', async () => {
    expect((await app.inject('/api/health')).json()).toMatchObject({ ok: true, source: { name: 'fake' }, uptimeSec: 0 });
    setNow(T0 + STALE_AFTER_MS + 1);
    expect((await app.inject('/api/health')).json()).toMatchObject({ ok: false });
    setNow(T0);
  });

  it('summary, areas, area, intersection', async () => {
    const summary = (await app.inject('/api/summary')).json<CitySummary>();
    expect(summary).toMatchObject({ active: 2, last24h: 5, unlocated24h: 2 });
    expect(summary.timeline).toHaveLength(24);
    const areas = (await app.inject('/api/areas')).json<AreaInfo[]>();
    expect(areas.map((a) => a.id)).toEqual(['mission', 'soma']);
    expect((await app.inject('/api/areas/soma')).json<AreaDetail>()).toMatchObject({ id: 'soma', active: 1 });
    expect((await app.inject('/api/intersections/200')).json<IntersectionDetail>()).toMatchObject({ id: '200', name: 'X ST \\ Y ST' });
  });

  it('never exposes unlocated calls', async () => {
    for (const url of ['/api/incidents?status=resolved', '/api/incidents', '/api/incidents/u1', '/api/summary']) {
      const body = (await app.inject(url)).body;
      expect(body, url).not.toContain('"u1"');
      expect(body, url).not.toContain('"u2"');
    }
  });

  it('404 for unknown ids, JSON errors without internals', async () => {
    for (const url of ['/api/areas/nope', '/api/intersections/nope', '/api/incidents/nope', '/api/incidents/u1', '/api/nothing']) {
      const res = await app.inject(url);
      expect(res.statusCode, url).toBe(404);
      expect(Object.keys(res.json())).toEqual(['error']);
    }
  });

  it.each(['/api/areas/Bad%20Id', '/api/areas/UPPER', '/api/intersections/a.b', '/api/incidents/..%2F..'])('400 for malformed id %s', async (url) => {
    expect((await app.inject(url)).statusCode).toBe(400);
  });

  it.each([
    'type=alien', 'status=foo', 'limit=0', 'limit=2001', 'limit=abc', 'limit=-1', 'limit=1.5', 'type=violent&type=traffic',
    'foo=bar', 'areaId=Bad%20Id', 'areaId=UPPER', 'intersectionId=a%2Fb', 'state=CA',
  ])('400 for invalid query %s', async (qs) => {
    const res = await app.inject(`/api/incidents?${qs}`);
    expect(res.statusCode).toBe(400);
    expect(typeof res.json().error).toBe('string');
  });

  it('filters incidents', async () => {
    const ids = async (qs: string) => (await app.inject(`/api/incidents${qs}`)).json<Incident[]>().map((i) => i.id);
    expect(await ids('')).toEqual(['1', '2']);
    expect(await ids('?type=violent')).toEqual(['1']);
    expect(await ids('?areaId=soma')).toEqual(['2']);
    expect(await ids('?intersectionId=200')).toEqual(['2']);
    expect(await ids('?status=on_scene')).toEqual(['1']);
    expect(await ids('?status=resolved')).toEqual(['3']);
    expect(await ids('?limit=1')).toHaveLength(1);
  });

  it('serves any incident of the window, resolved included', async () => {
    expect((await app.inject('/api/incidents/3')).json()).toMatchObject({ id: '3', status: 'resolved' });
  });

  it('restricts CORS and sets safe headers', async () => {
    const ok = await app.inject({ url: '/api/health', headers: { origin: 'http://localhost:5173' } });
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ok.headers['cache-control']).toBe('no-store');
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
    const bad = await app.inject({ url: '/api/health', headers: { origin: 'http://evil.example' } });
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('SSE /api/stream', () => {
  beforeAll(async () => {
    await app.listen({ port: 0, host: '127.0.0.1' });
    rt.hub.start();
  });

  it('sends a snapshot, then created/updated/resolved', async () => {
    const { port } = app.server.address() as AddressInfo;
    const ctrl = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/stream`, { signal: ctrl.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('x-accel-buffering')).toBe('no');

    const reader = res.body?.getReader() as ReadableStreamDefaultReader<Uint8Array>;
    const decoder = new TextDecoder();
    let text = '';
    const readUntil = async (needle: string): Promise<void> => {
      while (!text.includes(needle)) {
        const { value, done } = await reader.read();
        if (done) throw new Error('stream ended');
        text += decoder.decode(value, { stream: true });
      }
    };

    await readUntil('event: snapshot');
    const snapshot = JSON.parse(/event: snapshot\ndata: (.*)\n/.exec(text)?.[1] ?? 'null') as { incidents: Incident[]; summary: CitySummary };
    expect(snapshot.incidents.map((i) => i.id).sort()).toEqual(['1', '2']);
    expect(snapshot.summary.unlocated24h).toBe(2);

    const next = [
      { ...rows[0] as Incident, status: 'resolved' as const, resolvedAt: new Date(T0).toISOString() },
      rows[1] as Incident,
      rows[2] as Incident,
      incident({ id: '4' }, T0 - 1000),
    ];
    source.push({ incidents: next, unlocated: [] });
    await readUntil('event: incident.created');
    await readUntil('event: incident.resolved');
    expect(rt.hub.size).toBe(1);

    ctrl.abort();
    await new Promise((r) => setTimeout(r, 100));
    expect(rt.hub.size).toBe(0);
    await app.close();
    expect(source.started).toBe(false);
  });
});

describe('static web app', () => {
  it('serves the built app at / while /api keeps JSON errors', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'live911-static-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>ok</title>');
    const staticApp = await testApp(rt, { staticDir: dir });
    const home = await staticApp.inject('/');
    expect(home.statusCode).toBe(200);
    expect(home.headers['content-type']).toContain('text/html');
    expect(home.headers['x-content-type-options']).toBe('nosniff');
    const missing = await staticApp.inject('/api/nothing');
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toHaveProperty('error');
    await staticApp.close();
  });
});

describe('GET /api/config', () => {
  it('has no basemap by default', async () => {
    const plain = await testApp(rt);
    expect((await plain.inject('/api/config')).json()).toEqual({ basemap: null });
    await plain.close();
  });
  it('exposes the configured basemap', async () => {
    const basemap = { tiles: 'https://t.example.com/{z}/{x}/{y}.png', tileSize: 256 as const, maxzoom: 18, attribution: '© t' };
    const withMap = await testApp(rt, { basemap });
    expect((await withMap.inject('/api/config')).json()).toEqual({ basemap });
    await withMap.close();
  });
});
