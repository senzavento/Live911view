import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { Store } from './store';
import { mountMap } from './map';
import { mountPanels } from './panels';

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Elemento #${id} mancante`);
  return node;
}

const store = new Store();
const unmountMap = mountMap(el('map'), store);
const unmountPanels = mountPanels(
  { header: el('header'), sidebar: el('sidebar'), detail: el('detail'), legend: el('legend') },
  store,
);
store.connect();

window.addEventListener('beforeunload', () => {
  store.disconnect();
  unmountMap();
  unmountPanels();
});
