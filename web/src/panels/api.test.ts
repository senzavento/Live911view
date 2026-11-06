import { describe, expect, it, vi } from 'vitest';
import { ApiError, Resource, createApi } from './api';

const ok = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });

describe('createApi', () => {
  it('usa la cache breve', async () => {
    let t = 0;
    const f = vi.fn(async () => ok({ code: 'TX' }));
    const api = createApi(f, 1000, () => t);
    await api.state('TX');
    await api.state('TX');
    expect(f).toHaveBeenCalledTimes(1);
    t = 2000;
    await api.state('TX');
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('mappa gli errori HTTP e di rete', async () => {
    const api404 = createApi(async () => new Response(JSON.stringify({ error: 'Stato sconosciuto' }), { status: 404 }));
    await expect(api404.state('ZZ')).rejects.toMatchObject({ status: 404, message: 'Stato sconosciuto' });
    const apiNet = createApi(async () => {
      throw new TypeError('fail');
    });
    await expect(apiNet.city('x')).rejects.toBeInstanceOf(ApiError);
  });
  it('codifica i parametri', async () => {
    const f = vi.fn(async (_i: string) => ok([]));
    await createApi(f).cityIncidents('a b');
    expect(f.mock.calls[0]?.[0]).toBe('/api/incidents?cityId=a%20b&limit=500');
  });
});

describe('Resource', () => {
  it('loading → ready, poi retry dopo errore', async () => {
    let fail = true;
    const states: string[] = [];
    const r = new Resource<number>(
      async () => {
        if (fail) throw new ApiError('boom', 500);
        return 7;
      },
      (s) => states.push(s.status),
    );
    await r.load(false);
    expect(states).toEqual(['loading', 'error']);
    fail = false;
    await r.load(false);
    expect(r.state).toMatchObject({ status: 'ready', data: 7 });
    r.destroy();
  });
  it('un refresh silenzioso fallito mantiene i dati', async () => {
    let n = 0;
    const r = new Resource<number>(async () => {
      if (n++ > 0) throw new Error('x');
      return 1;
    }, () => undefined);
    await r.load(false);
    await r.load(true);
    expect(r.state).toMatchObject({ status: 'ready', data: 1 });
    r.destroy();
  });
  it('destroy annulla la richiesta in volo', async () => {
    let aborted = false;
    const states: string[] = [];
    const r = new Resource<number>(
      (signal) =>
        new Promise((_, rej) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            rej(new DOMException('a', 'AbortError'));
          });
        }),
      (s) => states.push(s.status),
    );
    const p = r.load(false);
    r.destroy();
    await p;
    expect(aborted).toBe(true);
    expect(states).toEqual(['loading']);
  });
});
