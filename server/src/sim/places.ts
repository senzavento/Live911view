import type { City } from '@live911/shared';
import type { Random } from './random';

const STREETS = [
  'Main St', 'Oak Ave', 'Maple Dr', 'Cedar Ln', 'Elm St', 'Park Ave', 'Washington Blvd', 'Lake St',
  'Hill Rd', 'Sunset Blvd', 'River Rd', 'Highland Ave', 'Church St', 'Pine St', 'Broadway', 'Market St',
  'Jefferson Ave', 'Lincoln Way', 'Mill Rd', 'Cherry St', 'Union Ave',
] as const;

const KM_PER_DEG_LAT = 111.32;
const MAX_SIGMAS = 2.5;

/** Std-dev of the scatter around the city centre, in km; grows with population. */
export function scatterSigmaKm(population: number): number {
  return 2 + 3.2 * Math.log10(population / 50_000 + 1);
}

const ordinal = (n: number): string => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 ? 0 : n % 10] ?? 'th'}`;
};

export function syntheticAddress(rng: Random): string {
  const block = rng.int(1, 98) * 100;
  const street = rng.next() < 0.25 ? `${ordinal(rng.int(1, 60))} St` : rng.pick(STREETS);
  return `${block} block of ${street}`;
}

export function scatterAround(city: City, sigmaKm: number, rng: Random): { lat: number; lng: number } {
  let dx = rng.normal() * sigmaKm;
  let dy = rng.normal() * sigmaKm;
  const max = sigmaKm * MAX_SIGMAS;
  const r = Math.hypot(dx, dy);
  if (r > max) {
    dx *= max / r;
    dy *= max / r;
  }
  const lat = city.lat + dy / KM_PER_DEG_LAT;
  const lng = city.lng + dx / (KM_PER_DEG_LAT * Math.cos((city.lat * Math.PI) / 180));
  return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
}
