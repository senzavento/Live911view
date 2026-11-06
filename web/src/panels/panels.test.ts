// @vitest-environment jsdom
import type { Incident } from '@live911/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../store';
import { createMockWorld, installFakeEventSource, mockApi, type MockWorld } from './dev/mock';
import { mountPanels } from './index';

type Roots = Record<'header' | 'sidebar' | 'detail' | 'legend', HTMLElement>;

function setup(): { roots: Roots; app: HTMLElement } {
  document.body.replaceChildren();
  const app = document.createElement('div');
  app.id = 'app';
  const mk = (tag: string, id: string): HTMLElement => {
    const e = document.createElement(tag);
    e.id = id;
    app.append(e);
    return e;
  };
  const roots = { header: mk('header', 'header'), sidebar: mk('aside', 'sidebar'), detail: mk('section', 'detail'), legend: mk('div', 'legend') };
  document.body.append(app);
  return { roots, app };
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 2000): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout in attesa della condizione');
    await wait(10);
  }
}
const q = <T extends HTMLElement>(root: HTMLElement, sel: string): T | null => root.querySelector<T>(sel);

describe('mountPanels', () => {
  let world: MockWorld;
  let restore: () => void;
  let store: Store;
  let unmount: () => void;
  let ctx: ReturnType<typeof setup>;

  async function boot(configure?: (w: MockWorld) => void): Promise<void> {
    world = createMockWorld(3, 60);
    configure?.(world);
    restore = installFakeEventSource(world);
    ctx = setup();
    store = new Store();
    unmount = mountPanels(ctx.roots, store, { api: mockApi(world) });
    store.connect();
    await until(() => store.summary !== null);
  }

  afterEach(() => {
    unmount();
    store.disconnect();
    restore();
  });

  describe('scenario normale', () => {
    beforeEach(async () => {
      await boot();
    });

    it('livello 0: badge dati reali, orario in ora di SF, KPI, 8 categorie, quartieri e nota', async () => {
      await until(() => (q(ctx.roots.header, '.kpi__value')?.textContent ?? '–') !== '–');
      const hdr = ctx.roots.header.textContent ?? '';
      expect(hdr).toContain('DATI REALI · ritardo ~10-20 min · fonte DataSF');
      expect(hdr).not.toContain('SIMULATI');
      expect(hdr).toMatch(/Dati delle \d{2}:\d{2} P[SD]T/);
      expect(hdr).toContain('Sorgente attiva');
      expect(hdr).toContain('ritardo 15 min');
      expect(ctx.roots.header.querySelectorAll('.kpi')).toHaveLength(5);
      expect(q(ctx.roots.header, '.src__warn')?.hidden).toBe(true);
      expect(q(ctx.roots.header, '.datanote')?.textContent).toContain('chiamate senza posizione (riservate) non mostrate sulla mappa');
      expect(q(ctx.roots.header, '.datanote')?.textContent).toContain('non fuoco/EMS');
      expect(q(ctx.roots.header, '.datanote a[href*="opendatacommons"]')).not.toBeNull();
      await until(() => ctx.roots.sidebar.querySelectorAll('.rank__row').length === 13);
      expect(ctx.roots.sidebar.querySelectorAll('.bars__row')).toHaveLength(8);
      expect(ctx.roots.legend.querySelectorAll('.legend__item')).toHaveLength(8);
      expect(ctx.roots.legend.textContent).toContain('a bassa rilevanza');
      expect(ctx.roots.sidebar.querySelectorAll('.chart__area').length).toBe(8);
      expect(ctx.roots.detail.hidden).toBe(true);
      expect(ctx.app.classList.contains('has-detail')).toBe(false);
    });

    it('drill-down quartiere → incrocio → chiamata e breadcrumb', async () => {
      await until(() => ctx.roots.sidebar.querySelectorAll('.rank__btn').length > 0);
      q<HTMLButtonElement>(ctx.roots.sidebar, '.rank__btn')?.click();
      expect(store.selection.areaId).toBeDefined();
      await until(() => ctx.roots.detail.querySelectorAll('.rank__row').length > 0);
      expect(ctx.roots.detail.hidden).toBe(false);
      expect(ctx.app.classList.contains('has-detail')).toBe(true);

      q<HTMLButtonElement>(ctx.roots.detail, '.rank__btn')?.click();
      expect(store.selection.intersectionId).toBeDefined();
      expect(store.selection.areaId).toBeDefined();
      await until(() => ctx.roots.detail.querySelectorAll('.inc').length > 0);
      await until(() => ctx.roots.header.querySelectorAll('.crumbs__item').length === 3);
      // attive prima, poi risolte
      const classes = [...ctx.roots.detail.querySelectorAll('.inc')].map((e) => e.classList.contains('is-resolved'));
      expect(classes.indexOf(true) === -1 || !classes.slice(classes.indexOf(true)).includes(false)).toBe(true);

      q<HTMLButtonElement>(ctx.roots.detail, '.inc__btn')?.click();
      expect(store.selection.incidentId).toBeDefined();
      await until(() => ctx.roots.detail.querySelectorAll('.steps__item').length === 4);
      expect(ctx.roots.detail.textContent).toMatch(/Da chiamata 911|Iniziata dall’agente/);
      await until(() => ctx.roots.header.querySelectorAll('.crumbs__item').length === 4);
      expect(q(ctx.roots.header, '.crumbs__item:first-child')?.textContent).toBe('San Francisco');

      // "Indietro" sale di un livello
      q<HTMLButtonElement>(ctx.roots.detail, '.btn--ghost')?.click();
      expect(store.selection.incidentId).toBeUndefined();
      expect(store.selection.intersectionId).toBeDefined();

      // breadcrumb radice → torna a San Francisco
      q<HTMLButtonElement>(ctx.roots.header, '.crumbs__btn')?.click();
      expect(store.selection).toEqual({});
      await until(() => ctx.roots.detail.hidden);
    });

    it('una chiamata risolta (non più nello store) viene caricata dall’API', async () => {
      const resolved = [...world.resolved.values()][0] as Incident;
      store.select({ areaId: resolved.areaId, intersectionId: resolved.intersectionId, incidentId: resolved.id });
      await until(() => q(ctx.roots.detail, '.card') !== null && !q(ctx.roots.detail, '.card')?.hidden);
      expect(q(ctx.roots.detail, '.banner')?.hidden).toBe(false);
      expect(q(ctx.roots.detail, '.banner')?.textContent).toContain('risolta');
    });

    it('chiamata inesistente: messaggio chiaro', async () => {
      store.select({ incidentId: 'nope' });
      await until(() => (q(ctx.roots.detail, '.status__msg')?.textContent ?? '').includes('non trovata'));
      expect(q(ctx.roots.detail, '.card')?.hidden).toBe(true);
    });

    it('evento resolved: il banner compare senza far sparire la scheda', async () => {
      const inc = [...store.incidents.values()][0];
      if (!inc) throw new Error('nessuna chiamata');
      store.select({ areaId: inc.areaId, intersectionId: inc.intersectionId, incidentId: inc.id });
      await until(() => q(ctx.roots.detail, '.card') !== null && !q(ctx.roots.detail, '.card')?.hidden);
      expect(q(ctx.roots.detail, '.banner')?.hidden).toBe(true);
      world.resolve(inc.id);
      await until(() => q(ctx.roots.detail, '.banner')?.hidden === false);
    });

    it('toggle "nascondi attività di polizia" riduce barre e legenda', async () => {
      await until(() => ctx.roots.sidebar.querySelectorAll('.bars__row').length === 8);
      q<HTMLButtonElement>(ctx.roots.legend, '.legend__toggle')?.click();
      await until(() => ctx.roots.sidebar.querySelectorAll('.bars__row').length === 7);
      expect(q(ctx.roots.legend, '.legend__toggle')?.getAttribute('aria-pressed')).toBe('true');
      expect(ctx.roots.sidebar.querySelectorAll('.chart__area').length).toBe(7);
      q<HTMLButtonElement>(ctx.roots.legend, '.legend__toggle')?.click();
      await until(() => ctx.roots.sidebar.querySelectorAll('.bars__row').length === 8);
    });

    it('errore API: messaggio con ruolo alert e Riprova', async () => {
      unmount();
      ctx = setup();
      const failing = { ...mockApi(world), area: async () => { throw new Error('Server non raggiungibile'); } };
      unmount = mountPanels(ctx.roots, store, { api: failing });
      store.select({ areaId: 'mission' });
      await until(() => q(ctx.roots.detail, '.status--error') !== null);
      expect(q(ctx.roots.detail, '.status--error')?.getAttribute('role')).toBe('alert');
      expect(ctx.roots.detail.textContent).toContain('Riprova');
    });

    it('unmount pulisce contenitori, classi e attributi', () => {
      unmount();
      expect(ctx.roots.header.children).toHaveLength(0);
      expect(ctx.roots.sidebar.children).toHaveLength(0);
      expect(ctx.roots.legend.children).toHaveLength(0);
      expect(ctx.app.classList.contains('panels-ready')).toBe(false);
      expect(ctx.app.querySelector('.scrim')).toBeNull();
      unmount = () => undefined;
    });
  });

  describe('sorgente in errore o obsoleta', () => {
    it('errore: testo esplicito e avviso con ruolo alert, KPI tempo "n/d"', async () => {
      await boot((w) => (w.sourceMode = 'error'));
      await until(() => (q(ctx.roots.header, '.src__label')?.textContent ?? '') === 'Errore sorgente');
      const warn = q(ctx.roots.header, '.src__warn');
      expect(warn?.hidden).toBe(false);
      expect(warn?.getAttribute('role')).toBe('alert');
      expect(warn?.textContent).toContain('non è riuscito');
      expect(q(ctx.roots.header, '.src__state--error')).not.toBeNull();
      // medianCriticalDispatchSec null → n/d
      const vals = [...ctx.roots.header.querySelectorAll('.kpi__value')].map((e) => e.textContent);
      expect(vals).toContain('n/d');
      // il badge di trasparenza resta
      expect(ctx.roots.header.textContent).toContain('DATI REALI');
    });

    it('obsoleta (ritardo > 30 min): "Dati obsoleti"', async () => {
      await boot((w) => (w.sourceMode = 'stale'));
      await until(() => (q(ctx.roots.header, '.src__label')?.textContent ?? '') === 'Dati obsoleti');
      expect(q(ctx.roots.header, '.src__state--stale')).not.toBeNull();
      expect(q(ctx.roots.header, '.src__warn')?.textContent).toContain('30 min');
      expect(q(ctx.roots.header, '.src__delay')?.textContent).toContain('ritardo 52 min');
    });
  });

  describe('sicurezza (XSS)', () => {
    it('nessun testo della fonte viene interpretato come HTML', async () => {
      await boot();
      const evil = '<img src=x onerror="window.__xss=1">';
      const bad: Incident = {
        ...([...store.incidents.values()][0] as Incident),
        id: 'evil1',
        description: evil,
        agency: evil,
        areaName: evil,
        address: evil,
      };
      store.incidents.set(bad.id, bad);
      const s = store.summary;
      if (!s) throw new Error('summary');
      store.summary = {
        ...s,
        source: { ...s.source, name: '<b>x</b>', ok: false, lastError: evil, url: 'javascript:alert(1)' },
        byArea: s.byArea.map((a, i) => (i === 0 ? { ...a, name: evil } : a)),
      };
      store.select({ areaId: bad.areaId, intersectionId: bad.intersectionId, incidentId: bad.id });
      await until(() => q(ctx.roots.detail, '.steps__item') !== null);
      await until(() => (ctx.roots.detail.textContent ?? '').includes(evil));
      for (const root of Object.values(ctx.roots)) {
        expect(root.querySelector('img')).toBeNull();
        expect(root.querySelector('b')).toBeNull();
      }
      await until(() => (ctx.roots.header.textContent ?? '').includes(evil));
      expect(ctx.roots.sidebar.textContent).toContain(evil);
      const link = q<HTMLAnchorElement>(ctx.roots.header, '.datanote a');
      expect(link?.getAttribute('href')).not.toContain('javascript:');
      expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
    });
  });
});
