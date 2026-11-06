import type { AreaInfo, Incident, IncidentType, Priority } from '@live911/shared';
import { Store } from '../../store';

/** Mock locale (nessun server): chiamate verosimili di San Francisco iniettate nello Store. */

// [id, nome, lat, lng, peso]
const AREA_SEEDS: Array<[string, string, number, number, number]> = [
  ['mission', 'Mission', 37.7599, -122.4148, 9], ['tenderloin', 'Tenderloin', 37.7847, -122.4141, 10],
  ['soma', 'South of Market', 37.7785, -122.4056, 9], ['financial-district', 'Financial District/South Beach', 37.7946, -122.3999, 4],
  ['castro', 'Castro/Upper Market', 37.7609, -122.435, 3], ['haight-ashbury', 'Haight Ashbury', 37.7692, -122.4481, 3],
  ['sunset', 'Sunset/Parkside', 37.7535, -122.493, 4], ['richmond', 'Outer Richmond', 37.78, -122.485, 2],
  ['inner-richmond', 'Inner Richmond', 37.78, -122.466, 2], ['marina', 'Marina', 37.8037, -122.4368, 3],
  ['north-beach', 'North Beach', 37.8061, -122.4103, 3], ['chinatown', 'Chinatown', 37.7941, -122.4078, 3],
  ['nob-hill', 'Nob Hill', 37.793, -122.4161, 3], ['russian-hill', 'Russian Hill', 37.801, -122.419, 2],
  ['pacific-heights', 'Pacific Heights', 37.7925, -122.4382, 2], ['western-addition', 'Western Addition', 37.7824, -122.433, 5],
  ['hayes-valley', 'Hayes Valley', 37.7759, -122.4245, 3], ['bayview', 'Bayview Hunters Point', 37.7298, -122.3913, 6],
  ['excelsior', 'Excelsior', 37.7242, -122.43, 3], ['outer-mission', 'Outer Mission', 37.709, -122.44, 2],
  ['noe-valley', 'Noe Valley', 37.7502, -122.4337, 2], ['potrero-hill', 'Potrero Hill', 37.76, -122.4, 3],
  ['bernal-heights', 'Bernal Heights', 37.739, -122.415, 2], ['glen-park', 'Glen Park', 37.734, -122.434, 1],
  ['visitacion-valley', 'Visitacion Valley', 37.713, -122.409, 2], ['oceanview', 'Oceanview/Merced/Ingleside', 37.714, -122.463, 2],
  ['west-of-twin-peaks', 'West of Twin Peaks', 37.738, -122.46, 2], ['inner-sunset', 'Inner Sunset', 37.763, -122.465, 2],
  ['lakeshore', 'Lakeshore', 37.73, -122.49, 1], ['presidio', 'Presidio', 37.7989, -122.4662, 1],
  ['golden-gate-park', 'Golden Gate Park', 37.7694, -122.4862, 1], ['lone-mountain', 'Lone Mountain/USF', 37.778, -122.451, 1],
  ['mission-bay', 'Mission Bay', 37.77, -122.393, 2], ['portola', 'Portola', 37.727, -122.406, 2],
  ['twin-peaks', 'Twin Peaks', 37.7544, -122.4477, 1], ['treasure-island', 'Treasure Island', 37.823, -122.37, 1],
];

export const MOCK_AREAS: AreaInfo[] = AREA_SEEDS.map(([id, name, lat, lng]) => ({ id, name, lat, lng }));

// PRNG deterministico: gli incroci sono sempre gli stessi tra un caricamento e l'altro
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STREETS = ['MISSION ST', 'VALENCIA ST', 'MARKET ST', 'FOLSOM ST', 'GEARY BLVD', 'FULTON ST', 'POLK ST', 'HAIGHT ST', 'IRVING ST', 'TAYLOR ST', 'LEAVENWORTH ST', 'TURK ST', 'OAK ST', 'MASON ST', 'CHURCH ST', 'DIVISADERO ST', 'FILLMORE ST', 'LOMBARD ST', 'BRYANT ST', 'HOWARD ST', '16TH ST', '24TH ST', '3RD ST', '9TH AVE'];

interface Xing {
  id: string;
  address: string;
  areaId: string;
  areaName: string;
  lat: number;
  lng: number;
  w: number;
}

const rnd = mulberry32(911);
const XINGS: Xing[] = [];
for (const [areaId, areaName, lat, lng, weight] of AREA_SEEDS) {
  const n = 5 + Math.round(weight * 1.6);
  for (let k = 0; k < n; k++) {
    const a = STREETS[Math.floor(rnd() * STREETS.length)] as string;
    let b = STREETS[Math.floor(rnd() * STREETS.length)] as string;
    if (b === a) b = '1ST ST';
    XINGS.push({
      id: `${areaId}-${k}`, address: `${a} \\ ${b}`, areaId, areaName,
      lat: lat + (rnd() - 0.5) * 0.012, lng: lng + (rnd() - 0.5) * 0.016,
      w: (k === 0 ? 4 : 1) * weight, // un incrocio caldo per quartiere
    });
  }
}
const TOTAL_W = XINGS.reduce((s, x) => s + x.w, 0);

const TYPE_ROLL: Array<[IncidentType, number, string[]]> = [
  ['proactive', 0.30, ['TRAFFIC STOP', 'PASSING CALL', 'STANDBY']],
  ['disturbance', 0.2, ['SUSPICIOUS PERSON', 'FIGHT NO WEAPON', 'NOISE NUISANCE']],
  ['property', 0.14, ['PETTY THEFT', 'AUTO BOOST', 'VANDALISM']],
  ['traffic', 0.1, ['VEH ACCIDENT', 'TRAFFIC HAZARD', 'DOUBLE PARKED VEHICLE']],
  ['alarm', 0.08, ['AUDIBLE ALARM', 'SILENT ALARM']],
  ['welfare', 0.08, ['WELL BEING CHECK', 'AIDED CASE']],
  ['violent', 0.07, ['ASSAULT / BATTERY', 'PERSON WITH A KNIFE', 'ROBBERY']],
  ['other', 0.03, ['MISC CALL']],
];
const AGENCIES = ['Police', 'Police', 'Police', 'Municipal Transportation Agency', 'Sheriff', 'HEART'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}
function pickXing(): Xing {
  let r = Math.random() * TOTAL_W;
  for (const x of XINGS) {
    r -= x.w;
    if (r <= 0) return x;
  }
  return XINGS[0] as Xing;
}

let seq = 0;
export function makeIncident(): Incident {
  const x = pickXing();
  let r = Math.random();
  let type: IncidentType = 'other';
  let descs: string[] = ['MISC CALL'];
  for (const [t, p, d] of TYPE_ROLL) {
    r -= p;
    if (r <= 0) { type = t; descs = d; break; }
  }
  const pr = Math.random();
  const priority: Priority = type === 'violent' ? (pr < 0.5 ? 1 : 2) : pr < 0.06 ? 1 : pr < 0.35 ? 2 : 3;
  const now = new Date().toISOString();
  return {
    id: `26${String(1100000 + ++seq)}`, type, priority, status: Math.random() < 0.5 ? 'dispatched' : 'on_scene',
    areaId: x.areaId, areaName: x.areaName, intersectionId: x.id, address: x.address,
    lat: x.lat, lng: x.lng, // posizione = incrocio (mascherata): più chiamate coincidono
    description: pick(descs), agency: pick(AGENCIES), officerInitiated: type === 'proactive',
    createdAt: now, updatedAt: now,
  };
}

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
        const cur = store.incidents.get(pick(ids)) as Incident;
        if (roll < 0.8) {
          store.incidents.delete(cur.id);
          emit(store, { kind: 'incident', op: 'resolved', incident: { ...cur, status: 'resolved', resolvedAt: new Date().toISOString() } });
        } else {
          const upd: Incident = { ...cur, status: 'on_scene', updatedAt: new Date().toISOString() };
          store.incidents.set(cur.id, upd);
          emit(store, { kind: 'incident', op: 'updated', incident: upd });
        }
      }
    }
  }, 200);
  return () => clearInterval(timer);
}
