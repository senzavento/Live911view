import 'maplibre-gl/dist/maplibre-gl.css';
import { Store } from '../../store';
import { mountMap } from '../index';
import { MOCK_AREAS, seedSnapshot, startFeed } from './mock';

const store = new Store();
const params = new URLSearchParams(location.search);
const unmount = mountMap(document.getElementById('map') as HTMLElement, store, {
  loadAreas: params.has('noareas') ? () => Promise.reject(new Error('offline')) : () => Promise.resolve(MOCK_AREAS),
});
seedSnapshot(store, Number(params.get('n') ?? 600));
const stop = params.has('nofeed') ? () => {} : startFeed(store, Number(params.get('rate') ?? 6));

Object.assign(window, { __store: store, __unmount: () => { stop(); unmount(); } });
