// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../store';
import { mockApi, createMockWorld, installFakeEventSource, type MockWorld } from './dev/mock';
import { mountPanels } from './index';

function setup(): { roots: Record<'header' | 'sidebar' | 'detail' | 'legend', HTMLElement>; app: HTMLElement } {
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

describe('mountPanels', () => {
  let world: MockWorld;
  let restore: () => void;
  let store: Store;
  let unmount: () => void;
  let ctx: ReturnType<typeof setup>;

  beforeEach(async () => {
    world = createMockWorld(3, 60);
    restore = installFakeEventSource(world);
    ctx = setup();
    store = new Store();
    unmount = mountPanels(ctx.roots, store, { api: mockApi(world) });
    store.connect();
    await until(() => store.summary !== null);
  });
  afterEach(() => {
    unmount();
    store.disconnect();
    restore();
  });

  it('mostra KPI, badge simulato, tipologie e classifica al livello nazionale', async () => {
    await until(() => (ctx.roots.header.querySelector('.kpi__value')?.textContent ?? '–') !== '–');
    expect(ctx.roots.header.textContent).toContain('DATI SIMULATI');
    expect(ctx.roots.header.querySelectorAll('.kpi')).toHaveLength(5);
    await until(() => ctx.roots.sidebar.querySelectorAll('.rank__row').length === 12);
    expect(ctx.roots.sidebar.querySelectorAll('.bars__row')).toHaveLength(6);
    expect(ctx.roots.legend.querySelectorAll('.legend__item')).toHaveLength(6);
    expect(ctx.roots.detail.hidden).toBe(true);
    expect(ctx.app.classList.contains('has-detail')).toBe(false);
  });

  it('click su uno stato seleziona e mostra il dettaglio, il breadcrumb risale', async () => {
    await until(() => ctx.roots.sidebar.querySelectorAll('.rank__btn').length > 0);
    ctx.roots.sidebar.querySelector<HTMLButtonElement>('.rank__btn')?.click();
    expect(store.selection.state).toBeDefined();
    await until(() => ctx.roots.detail.querySelectorAll('.rank__row').length > 0);
    expect(ctx.roots.detail.hidden).toBe(false);
    expect(ctx.app.classList.contains('has-detail')).toBe(true);

    // click città → livello 2
    ctx.roots.detail.querySelector<HTMLButtonElement>('.rank__btn')?.click();
    expect(store.selection.cityId).toBeDefined();
    await until(() => ctx.roots.detail.querySelector('.inc-list') !== null && ctx.roots.detail.querySelectorAll('.inc').length > 0);
    await until(() => ctx.roots.header.querySelectorAll('.crumbs__item').length === 3);

    // click riga incidente → livello 3
    ctx.roots.detail.querySelector<HTMLButtonElement>('.inc__btn')?.click();
    expect(store.selection.incidentId).toBeDefined();
    await until(() => ctx.roots.detail.querySelector('.steps') !== null);
    expect(ctx.roots.detail.querySelectorAll('.steps__item')).toHaveLength(3);
    await until(() => ctx.roots.header.querySelectorAll('.crumbs__item').length === 4);

    // breadcrumb "USA" → torna al nazionale
    ctx.roots.header.querySelector<HTMLButtonElement>('.crumbs__btn')?.click();
    expect(store.selection).toEqual({});
    await until(() => ctx.roots.detail.hidden);
  });

  it('incidente risolto: mostra il banner senza sparire', async () => {
    const inc = [...store.incidents.values()][0];
    if (!inc) throw new Error('nessun incidente');
    store.select({ state: inc.state, cityId: inc.cityId, incidentId: inc.id });
    await until(() => ctx.roots.detail.querySelector('.card') !== null && !ctx.roots.detail.querySelector<HTMLElement>('.card')?.hidden);
    expect(ctx.roots.detail.querySelector<HTMLElement>('.banner')?.hidden).toBe(true);
    world.resolve(inc.id);
    await until(() => ctx.roots.detail.querySelector<HTMLElement>('.banner')?.hidden === false);
    expect(ctx.roots.detail.textContent).toContain('risolto');
  });

  it('errore API: mostra messaggio e Riprova', async () => {
    const failing = { ...mockApi(world), state: async () => { throw new Error('Server non raggiungibile'); } };
    unmount();
    ctx = setup();
    unmount = mountPanels(ctx.roots, store, { api: failing });
    store.select({ state: 'TX' });
    await until(() => ctx.roots.detail.querySelector('.status--error') !== null);
    expect(ctx.roots.detail.querySelector('.status--error')?.getAttribute('role')).toBe('alert');
    expect(ctx.roots.detail.textContent).toContain('Riprova');
  });

  it('unmount pulisce i contenitori e le classi', () => {
    unmount();
    expect(ctx.roots.header.children).toHaveLength(0);
    expect(ctx.roots.sidebar.children).toHaveLength(0);
    expect(ctx.app.classList.contains('panels-ready')).toBe(false);
    expect(ctx.app.querySelector('.scrim')).toBeNull();
    unmount = () => undefined;
  });
});
