import type { AddressInfo } from 'node:net';
import type { Incident, NationalSummary } from '@live911/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { T0, testApp, testRuntime } from './testing';

const { rt, sim, setNow } = testRuntime(21);
const app = await testApp(rt);
sim.prime(T0);
setNow(T0 + 5000);

describe('API', () => {
  it('health', async () => {
    const res = await app.inject('/api/health');
    expect(res.json()).toMatchObject({ ok: true, simulated: true });
  });

  it('summary / cities / state / city', async () => {
    const summary = (await app.inject('/api/summary')).json<NationalSummary>();
    expect(summary.byState).toHaveLength(51);
    expect((await app.inject('/api/cities')).json()).toHaveLength(rt.cities.length);
    expect((await app.inject('/api/states/tx')).json()).toMatchObject({ code: 'TX' });
    expect((await app.inject('/api/cities/houston-tx')).json()).toMatchObject({ city: { name: 'Houston' } });
  });

  it('404 for unknown ids', async () => {
    for (const url of ['/api/states/ZZ', '/api/cities/nope', '/api/incidents/nope', '/api/nothing']) {
      const res = await app.inject(url);
      expect(res.statusCode, url).toBe(404);
      expect(res.json()).toHaveProperty('error');
    }
  });

  it.each([
    'type=alien', 'state=Texas', 'state=T1', 'status=foo', 'limit=0', 'limit=2001', 'limit=abc', 'limit=-1',
    'limit=1.5', 'type=fire&type=police', 'foo=bar', 'cityId=Bad%20Id',
  ])('400 for invalid query %s', async (qs) => {
    const res = await app.inject(`/api/incidents?${qs}`);
    expect(res.statusCode).toBe(400);
    expect(typeof res.json().error).toBe('string');
  });

  it('filters incidents and honours limit', async () => {
    const res = await app.inject('/api/incidents?type=fire&state=tx&limit=5');
    const list = res.json<Incident[]>();
    expect(list.length).toBeLessThanOrEqual(5);
    for (const i of list) {
      expect(i.type).toBe('fire');
      expect(i.state).toBe('TX');
      expect(i.status).not.toBe('resolved');
    }
    const def = (await app.inject('/api/incidents')).json<Incident[]>();
    expect(def).toHaveLength(500);
    const [first] = def;
    expect((await app.inject(`/api/incidents/${first?.id}`)).json()).toEqual(first);
  });

  it('serves resolved incidents only when asked', async () => {
    setNow(T0 + 20 * 60_000);
    const resolved = (await app.inject('/api/incidents?status=resolved&limit=10')).json<Incident[]>();
    expect(resolved).toHaveLength(10);
    expect(resolved.every((i) => i.status === 'resolved' && i.resolvedAt)).toBe(true);
  });

  it('restricts CORS and hides internals', async () => {
    const ok = await app.inject({ url: '/api/health', headers: { origin: 'http://localhost:5173' } });
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const bad = await app.inject({ url: '/api/health', headers: { origin: 'http://evil.example' } });
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('SSE /api/stream', () => {
  beforeAll(async () => {
    await app.listen({ port: 0, host: '127.0.0.1' });
    rt.hub.start();
  });

  it('sends a snapshot, then live events', async () => {
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
    setNow(T0 + 25 * 60_000 + 3000);
    await readUntil('event: incident.created');
    expect(text).toMatch(/event: incident\.(updated|resolved)/);
    expect(rt.hub.size).toBe(1);

    ctrl.abort();
    await new Promise((r) => setTimeout(r, 100));
    expect(rt.hub.size).toBe(0);
    await app.close();
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
