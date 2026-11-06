import { INCIDENT_TYPES } from '@live911/shared';
import type { City, Incident, IncidentType, Priority } from '@live911/shared';
import { Store } from '../../store';
import { STATE_GEO } from '../geo-data';

/** Mock locale (nessun server): genera Incident finti e li inietta nello Store. */

const CITY_SEEDS: Array<[string, string, string, number, number]> = [
  ['new-york-ny', 'New York', 'NY', 40.71, -74.0], ['los-angeles-ca', 'Los Angeles', 'CA', 34.05, -118.24],
  ['chicago-il', 'Chicago', 'IL', 41.88, -87.63], ['houston-tx', 'Houston', 'TX', 29.76, -95.37],
  ['dallas-tx', 'Dallas', 'TX', 32.78, -96.8], ['phoenix-az', 'Phoenix', 'AZ', 33.45, -112.07],
  ['philadelphia-pa', 'Philadelphia', 'PA', 39.95, -75.17], ['miami-fl', 'Miami', 'FL', 25.76, -80.19],
  ['atlanta-ga', 'Atlanta', 'GA', 33.75, -84.39], ['seattle-wa', 'Seattle', 'WA', 47.61, -122.33],
  ['denver-co', 'Denver', 'CO', 39.74, -104.99], ['boston-ma', 'Boston', 'MA', 42.36, -71.06],
  ['san-francisco-ca', 'San Francisco', 'CA', 37.77, -122.42], ['detroit-mi', 'Detroit', 'MI', 42.33, -83.05],
  ['minneapolis-mn', 'Minneapolis', 'MN', 44.98, -93.27], ['las-vegas-nv', 'Las Vegas', 'NV', 36.17, -115.14],
  ['anchorage-ak', 'Anchorage', 'AK', 61.22, -149.9], ['honolulu-hi', 'Honolulu', 'HI', 21.31, -157.86],
  ['austin-tx', 'Austin', 'TX', 30.27, -97.74], ['portland-or', 'Portland', 'OR', 45.52, -122.68],
  ['san-diego-ca', 'San Diego', 'CA', 32.72, -117.16], ['nashville-tn', 'Nashville', 'TN', 36.16, -86.78],
  ['new-orleans-la', 'New Orleans', 'LA', 29.95, -90.07], ['kansas-city-mo', 'Kansas City', 'MO', 39.1, -94.58],
];

export const MOCK_CITIES: City[] = CITY_SEEDS.map(([id, name, state, lat, lng]) => ({ id, name, state, lat, lng, population: 500000 }));

// pesi per città (le grandi hanno più incidenti)
const WEIGHTS = MOCK_CITIES.map((c, i) => (i < 6 ? 5 : i < 12 ? 3 : 1));

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
function pickCity(): City {
  const total = WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < MOCK_CITIES.length; i++) {
    r -= WEIGHTS[i] ?? 1;
    if (r <= 0) return MOCK_CITIES[i] as City;
  }
  return MOCK_CITIES[0] as City;
}

let seq = 0;
export function makeIncident(): Incident {
  const city = pickCity();
  const type: IncidentType = INCIDENT_TYPES[Math.floor(Math.random() * INCIDENT_TYPES.length)] as IncidentType;
  const pr = Math.random();
  const priority: Priority = pr < 0.12 ? 1 : pr < 0.4 ? 2 : 3;
  const now = new Date().toISOString();
  return {
    id: `mock-${++seq}`, type, priority, status: Math.random() < 0.5 ? 'dispatched' : 'on_scene', cityId: city.id, state: city.state,
    lat: city.lat + rand(-0.12, 0.12), lng: city.lng + rand(-0.15, 0.15),
    address: `${Math.floor(rand(1, 99)) * 100} block of Main St`, description: 'Incidente sintetico (mock)',
    unitsAssigned: Math.floor(rand(1, 6)), createdAt: now, updatedAt: now,
  };
}

/** Applica un evento allo store come farebbe l'SSE (usa i membri pubblici + emit privato via cast tipizzato). */
type Emitter = { emit(e: unknown): void };
function emit(store: Store, e: unknown): void {
  (store as unknown as Emitter).emit(e);
}

export function seedSnapshot(store: Store, n: number): void {
  store.incidents.clear();
  for (let i = 0; i < n; i++) {
    const inc = makeIncident();
    store.incidents.set(inc.id, inc);
  }
  emit(store, { kind: 'snapshot' });
}

/** Avvia un flusso di created/updated/resolved. Ritorna lo stop. */
export function startFeed(store: Store, perSec: number): () => void {
  const timer = setInterval(() => {
    const n = Math.max(1, Math.round(perSec / 5));
    for (let k = 0; k < n; k++) {
      const roll = Math.random();
      if (roll < 0.5 || store.incidents.size < 20) {
        const inc = makeIncident();
        store.incidents.set(inc.id, inc);
        emit(store, { kind: 'incident', op: 'created', incident: inc });
      } else {
        const ids = [...store.incidents.keys()];
        const id = ids[Math.floor(Math.random() * ids.length)] as string;
        const cur = store.incidents.get(id) as Incident;
        if (roll < 0.8) {
          store.incidents.delete(id);
          emit(store, { kind: 'incident', op: 'resolved', incident: { ...cur, status: 'resolved' } });
        } else {
          const upd: Incident = { ...cur, status: 'on_scene', updatedAt: new Date().toISOString() };
          store.incidents.set(id, upd);
          emit(store, { kind: 'incident', op: 'updated', incident: upd });
        }
      }
    }
  }, 200);
  return () => clearInterval(timer);
}

export { STATE_GEO };
