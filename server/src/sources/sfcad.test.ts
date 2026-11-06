import { describe, expect, it, vi } from 'vitest';
import { rawRow, sensitiveRow } from '../fixtures';
import type { SourceWindow } from '../source';
import { T0 } from '../testing';
import { nextDelayMs, SfCadSource } from './sfcad';

interface Call {
  url: URL;
  headers: Record<string, string>;
}

interface Backend {
  fetch: typeof fetch;
  calls: Call[];
  meta: { rowsUpdatedAt: unknown } | 'fail' | 'hang';
  data: ((url: URL) => Response | Promise<Response>) | unknown[];
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

function backend(rows: unknown[] = [rawRow()]): Backend {
  const b: Backend = {
    calls: [],
    meta: { rowsUpdatedAt: 1000 },
    data: rows,
    fetch: async (input, init) => {
      const url = new URL(String(input));
      b.calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
      const hang = (): Promise<Response> =>
        new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(init.signal?.reason), { once: true }));
      if (url.pathname.startsWith('/api/views/')) {
        if (b.meta === 'fail') return json({ error: 'x' }, 500);
        if (b.meta === 'hang') return hang();
        return json(b.meta);
      }
      if (typeof b.data === 'function') return b.data(url);
      const offset = Number(url.searchParams.get('$offset'));
      const limit = Number(url.searchParams.get('$limit'));
      return json((b.data as unknown[]).slice(offset, offset + limit));
    },
  };
  return b;
}

function setup(b: Backend, extra: Partial<ConstructorParameters<typeof SfCadSource>[0]> = {}) {
  let now = T0;
  const source = new SfCadSource({ pollSec: 120, fetch: b.fetch, now: () => now, random: () => 0.5, timeoutMs: 200, ...extra });
  const windows: SourceWindow[] = [];
  source.subscribe((w) => windows.push(w));
  return { source, windows, advance: (ms: number) => (now += ms) };
}

describe('SfCadSource.pollOnce', () => {
  it('requests the 48 h window in SF local time, with identifying headers and no notes columns', async () => {
    const b = backend();
    const { source } = setup(b, { appToken: 'tok123' });
    await source.pollOnce();
    const [meta, data] = b.calls;
    expect(meta?.url.pathname).toBe('/api/views/gnap-fj3t.json');
    expect(data?.url.pathname).toBe('/resource/gnap-fj3t.json');
    // T0 - 48 h = 2026-11-04 14:00 PST
    expect(data?.url.searchParams.get('$where')).toBe("received_datetime > '2026-11-04T14:00:00'");
    expect(data?.url.searchParams.get('$select')).not.toMatch(/notes/);
    expect(data?.headers['X-App-Token']).toBe('tok123');
    expect(data?.headers['User-Agent']).toMatch(/Live911view/);
  });

  it('omits the app token when not configured', async () => {
    const b = backend();
    await setup(b).source.pollOnce();
    expect(b.calls[1]?.headers['X-App-Token']).toBeUndefined();
  });

  it('emits a window with located and unlocated calls, counting invalid rows apart', async () => {
    const b = backend([rawRow(), rawRow({ cad_number: '2' }), sensitiveRow(), 'garbage', rawRow({ cad_number: undefined })]);
    const { source, windows } = setup(b);
    await source.pollOnce();
    expect(windows).toHaveLength(1);
    expect(windows[0]?.incidents.map((i) => i.id).sort()).toEqual(['2', '263082274']);
    expect(windows[0]?.unlocated).toHaveLength(1);
    expect(JSON.stringify(windows[0])).not.toMatch(/SUICIDE|MUST NEVER LEAK/);
    expect(windows[0]?.windowStartMs).toBe(T0 - 48 * 3_600_000);
  });

  it('updates status: dataAsOf in UTC, delay, lastPollAt, ok', async () => {
    const { source, advance } = setup(backend());
    expect(source.status()).toMatchObject({ ok: false, dataAsOf: null, delaySec: null, lastPollAt: null });
    await source.pollOnce();
    advance(60_000);
    expect(source.status()).toMatchObject({
      ok: true,
      dataAsOf: '2026-11-06T21:44:08.000Z',
      delaySec: (T0 + 60_000 - Date.parse('2026-11-06T21:44:08Z')) / 1000,
      lastPollAt: new Date(T0).toISOString(),
      license: 'PDDL',
    });
    expect(source.lastSuccessAt()).toBe(T0);
  });

  it('skips the download while rowsUpdatedAt is unchanged, but re-downloads every N polls', async () => {
    const b = backend();
    const { source, windows } = setup(b, { fullEvery: 2 });
    await source.pollOnce();
    await source.pollOnce();
    await source.pollOnce();
    expect(windows).toHaveLength(1);
    await source.pollOnce(); // third skip would exceed fullEvery
    expect(windows).toHaveLength(2);
    b.meta = { rowsUpdatedAt: 2000 };
    await source.pollOnce();
    expect(windows).toHaveLength(3);
  });

  it('still downloads when the metadata endpoint fails or is malformed', async () => {
    const b = backend();
    b.meta = 'fail';
    const { source, windows } = setup(b);
    await source.pollOnce();
    b.meta = { rowsUpdatedAt: 'soon' };
    await source.pollOnce();
    expect(windows).toHaveLength(2);
    expect(source.status().ok).toBe(true);
  });

  it('follows pagination', async () => {
    const rows = Array.from({ length: 5 }, (_v, i) => rawRow({ cad_number: String(100 + i) }));
    const b = backend(rows);
    const { source, windows } = setup(b, { pageSize: 2 });
    await source.pollOnce();
    expect(windows[0]?.incidents).toHaveLength(5);
    expect(b.calls.filter((c) => c.url.pathname.startsWith('/resource/'))).toHaveLength(3);
  });

  it('de-duplicates CAD numbers, keeping the most recently updated', async () => {
    const b = backend([rawRow({ call_last_updated_at: '2026-11-06T13:35:00.000', priority_final: 'A' }), rawRow()]);
    const { source, windows } = setup(b);
    await source.pollOnce();
    expect(windows[0]?.incidents).toHaveLength(1);
    expect(windows[0]?.incidents[0]?.priority).toBe(1);
  });

  it('does not let a call be both located and unlocated', async () => {
    const { source, windows } = setup(backend([rawRow(), rawRow({ sensitive_call: true })]));
    await source.pollOnce();
    expect(windows[0]?.incidents).toHaveLength(0);
    expect(windows[0]?.unlocated).toHaveLength(1);
  });
});

describe('SfCadSource resilience', () => {
  it('records HTTP 500 without emitting, then recovers', async () => {
    const b = backend();
    b.data = () => json({ message: 'boom' }, 500);
    const { source, windows } = setup(b);
    await source.pollOnce();
    expect(source.status()).toMatchObject({ ok: false, lastError: 'HTTP 500' });
    expect(source.lastSuccessAt()).toBeNull();
    b.data = [rawRow()];
    await source.pollOnce();
    expect(source.status()).toMatchObject({ ok: true });
    expect(source.status().lastError).toBeUndefined();
    expect(windows).toHaveLength(1);
  });

  it.each([
    ['not JSON', () => new Response('<html>oops</html>', { status: 200 })],
    ['not an array', () => json({ rows: [] })],
    ['only invalid rows', () => json([1, 'a', null, {}])],
  ])('rejects a malformed response (%s) without crashing', async (_n, respond) => {
    const b = backend();
    b.data = respond;
    const { source, windows } = setup(b);
    await source.pollOnce();
    expect(windows).toHaveLength(0);
    expect(source.status().ok).toBe(false);
    expect(source.status().lastError).toMatch(/invalid/);
  });

  it('accepts an empty array as a valid empty window', async () => {
    const { source, windows } = setup(backend([]));
    await source.pollOnce();
    expect(windows).toHaveLength(1);
    expect(source.status().ok).toBe(true);
  });

  it('times out on a hanging server', async () => {
    const b = backend();
    b.meta = 'hang';
    b.data = () => new Promise<Response>(() => undefined);
    b.fetch = ((orig) => (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
        void orig(input, init).then(resolve, reject);
      }))(b.fetch);
    const { source } = setup(b, { timeoutMs: 30 });
    await source.pollOnce();
    expect(source.status()).toMatchObject({ ok: false, lastError: 'timeout' });
  });

  it('hides network error details', async () => {
    const b = backend();
    b.fetch = async () => {
      throw new TypeError('fetch failed: https://data.sf.gov/?token=secret');
    };
    const { source } = setup(b, { appToken: 'secret' });
    await source.pollOnce();
    expect(source.status().lastError).toBe('network error');
    expect(JSON.stringify(source.status())).not.toContain('secret');
  });

  it('survives a throwing listener', async () => {
    const { source } = setup(backend());
    source.subscribe(() => {
      throw new Error('listener bug');
    });
    await source.pollOnce();
    expect(source.status().ok).toBe(true);
  });
});

describe('SfCadSource scheduling', () => {
  it('polls on start and stops cleanly', async () => {
    vi.useFakeTimers();
    try {
      const b = backend();
      const { source, windows } = setup(b, { fullEvery: 1000 });
      source.start();
      await vi.advanceTimersByTimeAsync(10);
      expect(windows).toHaveLength(1);
      const before = b.calls.length;
      await vi.advanceTimersByTimeAsync(130_000);
      expect(b.calls.length).toBeGreaterThan(before);
      source.stop();
      const after = b.calls.length;
      await vi.advanceTimersByTimeAsync(600_000);
      expect(b.calls.length).toBe(after);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('nextDelayMs', () => {
  const poll = 120_000;
  it('stays near the period on success', () => {
    expect(nextDelayMs(poll, 0, () => 0.5)).toBe(poll);
    expect(nextDelayMs(poll, 0, () => 0)).toBe(poll * 0.9);
  });
  it('grows exponentially with jitter, never below the period, capped at 15 min', () => {
    expect(nextDelayMs(poll, 1, () => 1)).toBe(240_000);
    expect(nextDelayMs(poll, 2, () => 1)).toBe(480_000);
    expect(nextDelayMs(poll, 1, () => 0)).toBe(poll);
    expect(nextDelayMs(poll, 10, () => 1)).toBe(900_000);
    expect(nextDelayMs(poll, 10, () => 0)).toBe(450_000);
  });
});
