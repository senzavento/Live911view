import type { StateInfo } from '@live911/shared';

/** Centroide + zoom di inquadratura per i 50 stati e DC (codici USPS). */
export interface StateGeo extends StateInfo {
  /** zoom consigliato per inquadrare lo stato */
  zoom: number;
}

const S = (code: string, name: string, lat: number, lng: number, zoom: number): StateGeo => ({ code, name, lat, lng, zoom });

export const STATE_GEO: readonly StateGeo[] = [
  S('AL', 'Alabama', 32.8, -86.8, 6.2),
  S('AK', 'Alaska', 64.0, -152.0, 3.2),
  S('AZ', 'Arizona', 34.2, -111.7, 5.9),
  S('AR', 'Arkansas', 34.9, -92.4, 6.3),
  S('CA', 'California', 37.2, -119.5, 5.3),
  S('CO', 'Colorado', 39.0, -105.5, 6.1),
  S('CT', 'Connecticut', 41.6, -72.7, 8.0),
  S('DE', 'Delaware', 39.0, -75.5, 8.0),
  S('DC', 'District of Columbia', 38.9, -77.03, 10.5),
  S('FL', 'Florida', 28.6, -82.4, 6.0),
  S('GA', 'Georgia', 32.7, -83.4, 6.2),
  S('HI', 'Hawaii', 20.8, -156.9, 6.3),
  S('ID', 'Idaho', 44.4, -114.6, 5.6),
  S('IL', 'Illinois', 40.0, -89.2, 6.0),
  S('IN', 'Indiana', 39.9, -86.3, 6.6),
  S('IA', 'Iowa', 42.0, -93.5, 6.4),
  S('KS', 'Kansas', 38.5, -98.4, 6.3),
  S('KY', 'Kentucky', 37.5, -85.3, 6.5),
  S('LA', 'Louisiana', 31.1, -92.0, 6.4),
  S('ME', 'Maine', 45.3, -69.2, 6.4),
  S('MD', 'Maryland', 39.0, -76.8, 7.2),
  S('MA', 'Massachusetts', 42.3, -71.8, 7.4),
  S('MI', 'Michigan', 44.3, -85.4, 5.8),
  S('MN', 'Minnesota', 46.3, -94.3, 5.6),
  S('MS', 'Mississippi', 32.7, -89.7, 6.3),
  S('MO', 'Missouri', 38.4, -92.5, 6.1),
  S('MT', 'Montana', 47.0, -109.6, 5.5),
  S('NE', 'Nebraska', 41.5, -99.8, 6.1),
  S('NV', 'Nevada', 39.3, -116.6, 5.6),
  S('NH', 'New Hampshire', 43.7, -71.6, 7.3),
  S('NJ', 'New Jersey', 40.1, -74.7, 7.4),
  S('NM', 'New Mexico', 34.4, -106.1, 5.9),
  S('NY', 'New York', 42.9, -75.5, 6.2),
  S('NC', 'North Carolina', 35.5, -79.4, 6.0),
  S('ND', 'North Dakota', 47.5, -100.5, 6.2),
  S('OH', 'Ohio', 40.3, -82.8, 6.5),
  S('OK', 'Oklahoma', 35.6, -97.5, 6.1),
  S('OR', 'Oregon', 43.9, -120.6, 5.9),
  S('PA', 'Pennsylvania', 40.9, -77.8, 6.6),
  S('RI', 'Rhode Island', 41.7, -71.5, 9.0),
  S('SC', 'South Carolina', 33.9, -80.9, 6.9),
  S('SD', 'South Dakota', 44.4, -100.2, 6.2),
  S('TN', 'Tennessee', 35.9, -86.4, 6.3),
  S('TX', 'Texas', 31.5, -99.3, 5.0),
  S('UT', 'Utah', 39.3, -111.7, 6.1),
  S('VT', 'Vermont', 44.1, -72.7, 7.4),
  S('VA', 'Virginia', 37.5, -78.8, 6.4),
  S('WA', 'Washington', 47.4, -120.5, 6.2),
  S('WV', 'West Virginia', 38.6, -80.6, 6.8),
  S('WI', 'Wisconsin', 44.6, -89.9, 6.0),
  S('WY', 'Wyoming', 43.0, -107.5, 6.0),
];

export const STATE_GEO_BY_CODE: ReadonlyMap<string, StateGeo> = new Map(STATE_GEO.map((s) => [s.code, s]));

/** [[ovest, sud], [est, nord]] degli USA contigui, con margine. */
export const US_BOUNDS: [[number, number], [number, number]] = [
  [-125.5, 24.0],
  [-66.0, 49.8],
];

export interface LngLatPoint {
  lat: number;
  lng: number;
}
