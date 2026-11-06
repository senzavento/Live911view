const PACIFIC = new Set(['CA', 'WA', 'OR', 'NV']);
const MOUNTAIN = new Set(['AZ', 'CO', 'ID', 'MT', 'NM', 'UT', 'WY']);
const CENTRAL = new Set([
  'AL', 'AR', 'IL', 'IA', 'KS', 'LA', 'MN', 'MS', 'MO', 'NE', 'ND', 'OK', 'SD', 'TN', 'TX', 'WI',
]);

/**
 * Standard-time UTC offset in hours. DST is deliberately ignored: the offset
 * only shapes the synthetic daily activity curve. West Texas (El Paso) is Mountain.
 */
export function utcOffsetHours(state: string, lng: number): number {
  if (state === 'HI') return -10;
  if (state === 'AK') return -9;
  if (state === 'TX' && lng < -104) return -7;
  if (PACIFIC.has(state)) return -8;
  if (MOUNTAIN.has(state)) return -7;
  if (CENTRAL.has(state)) return -6;
  return -5;
}
