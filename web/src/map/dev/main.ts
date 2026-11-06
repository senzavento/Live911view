import 'maplibre-gl/dist/maplibre-gl.css';
import { Store } from '../../store';
import { mountMap } from '../index';
import { MOCK_CITIES, seedSnapshot, startFeed } from './mock';

const store = new Store();
const params = new URLSearchParams(location.search);
const unmount = mountMap(document.getElementById('map') as HTMLElement, store, {
  loadCities: params.has('nocities') ? () => Promise.reject(new Error('offline')) : () => Promise.resolve(MOCK_CITIES),
});
seedSnapshot(store, Number(params.get('n') ?? 3000));
const stop = params.has('nofeed') ? () => {} : startFeed(store, Number(params.get('rate') ?? 10));

Object.assign(window, { __store: store, __unmount: () => { stop(); unmount(); } });
