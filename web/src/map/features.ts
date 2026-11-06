import { TYPE_META } from '@live911/shared';
import type { Incident } from '@live911/shared';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { Aggregator, bubbleRadius, dominantType, formatCount, topTypes } from './aggregate';
import type { Bucket } from './aggregate';
import { STATE_GEO_BY_CODE } from './geo-data';
import type { LngLatPoint } from './geo-data';
import type { PulseFrame } from './pulses';

export type Props = Record<string, string | number>;
export type PointFeature = Feature<Point, Props>;
export type PointCollection = FeatureCollection<Point, Props>;

const NEUTRAL = '#8a96a8';

export function collection(features: PointFeature[]): PointCollection {
  return { type: 'FeatureCollection', features };
}

function point(lng: number, lat: number, properties: Props, id?: string): PointFeature {
  return { type: 'Feature', id, geometry: { type: 'Point', coordinates: [lng, lat] }, properties };
}

export function incidentFeature(i: Incident): PointFeature {
  return point(i.lng, i.lat, { id: i.id, t: i.type, p: i.priority, st: i.status === 'on_scene' ? 1 : 0 }, i.id);
}

function bucketProps(b: Bucket, base: number, k: number, max: number, selected: boolean): Props {
  const [first, second] = topTypes(b.byType);
  const dom = dominantType(b.byType);
  return {
    n: b.active,
    crit: b.critical,
    c: dom ? TYPE_META[dom].color : NEUTRAL,
    c2: second ? TYPE_META[second].color : first ? TYPE_META[first].color : NEUTRAL,
    r: bubbleRadius(b.active, base, k, max),
    lbl: formatCount(b.active),
    sel: selected ? 1 : 0,
  };
}

export function stateFeatures(agg: Aggregator, selectedState?: string): PointFeature[] {
  const out: PointFeature[] = [];
  for (const [code, b] of agg.states) {
    const geo = STATE_GEO_BY_CODE.get(code);
    if (!geo || b.active <= 0) continue;
    out.push(point(geo.lng, geo.lat, { code, ...bucketProps(b, 11, 3.4, 58, code === selectedState) }, code));
  }
  return out;
}

export function cityFeatures(
  agg: Aggregator,
  position: (cityId: string) => LngLatPoint | undefined,
  selectedCity?: string,
): PointFeature[] {
  const out: PointFeature[] = [];
  for (const [cityId, b] of agg.cities) {
    if (b.active <= 0) continue;
    const pos = position(cityId) ?? { lat: b.sumLat / b.active, lng: b.sumLng / b.active };
    out.push(point(pos.lng, pos.lat, { cityId, state: b.state, ...bucketProps(b, 7, 2.4, 40, cityId === selectedCity) }, cityId));
  }
  return out;
}

export function pulseFeatures(frames: PulseFrame[]): PointFeature[] {
  return frames.map((f) => point(f.lng, f.lat, { k: f.kind === 'birth' ? 0 : 1, c: f.color, r: f.r, o: f.o, w: f.w }));
}
