import '../../styles.css';
import { Store } from '../../store';
import { mountPanels } from '../index';
import { createMockWorld, installMock } from './mock';

// Pagina SOLO di sviluppo: nessun server reale, tutto finto.
const world = createMockWorld(7);
installMock(world, 120);
world.start(2000);
const params = new URLSearchParams(location.search);
if (params.has('fail')) world.failNext = 2;

const el = (id: string): HTMLElement => {
  const n = document.getElementById(id);
  if (!n) throw new Error(id);
  return n;
};
const mapEl = el('map');
mapEl.style.background =
  'radial-gradient(circle at 40% 45%, #16233d 0, #0b111c 70%), #0b111c';
mapEl.textContent = '';
const store = new Store();
const unmount = mountPanels({ header: el('header'), sidebar: el('sidebar'), detail: el('detail'), legend: el('legend') }, store);
store.connect();
(window as unknown as { __dev: unknown }).__dev = { store, world, unmount };
