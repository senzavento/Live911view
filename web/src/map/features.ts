import { TYPE_META } from '@live911/shared';
import type { Incident } from '@live911/shared';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { Aggregator, bubbleRadius, bucketCentroid, dominantType, formatCount, topTypes } from './aggregate';
import type { Bucket } from './aggregate';
import { jitteredPosition } from './jitter';
import type { PulseFrame } from './pulses';
import type { LngLatPoint } from './selection-sync';

export type Props = Record<string, string | number>;
export type PointFeature = Feature<Point, Props>;
export type PointCollection = FeatureCollection<Point, Props>;

const NEUTRAL = '#8a96a8';
/** Opacità relativa della categoria `proactive` (rumore a bassa rilevanza). */
export const PROACTIVE_DIM = 0.45;

export function collection(features: PointFeature[]): PointCollection {
  return { type: 'FeatureCollection', features };
}

function point(lng: number, lat: number, properties: Props, id?: string): PointFeature {
  return { type: 'Feature', id, geometry: { type: 'Point', coordinates: [lng, lat] }, properties };
}

/** Puntino di una singola chiamata, con offset deterministico per non sovrapporre chiamate allo stesso incrocio. */
export function incidentFeature(i: Incident): PointFeature {
  const [lng, lat] = jitteredPosition(i.id, i.lng, i.lat);
  return point(
    lng,
    lat,
    { id: i.id, t: i.type, p: i.priority, st: i.status === 'on_scene' ? 1 : 0, d: i.type === 'proactive' ? PROACTIVE_DIM : 1 },
    i.id,
  );
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

export function areaFeatures(
  agg: Aggregator,
  position: (areaId: string) => LngLatPoint | undefined,
  selectedArea?: string,
): PointFeature[] {
  const out: PointFeature[] = [];
  for (const [areaId, b] of agg.areas) {
    if (b.active <= 0) continue;
    const pos = position(areaId) ?? bucketCentroid(b);
    out.push(point(pos.lng, pos.lat, { areaId, name: b.name, ...bucketProps(b, 11, 3.2, 54, areaId === selectedArea) }, areaId));
  }
  return out;
}

export function intersectionFeatures(agg: Aggregator, selectedIntersection?: string): PointFeature[] {
  const out: PointFeature[] = [];
  for (const [intersectionId, b] of agg.intersections) {
    if (b.active <= 0) continue;
    const pos = bucketCentroid(b);
    out.push(
      point(
        pos.lng,
        pos.lat,
        { intersectionId, areaId: b.areaId, name: b.name, area: b.areaName, ...bucketProps(b, 6, 2.6, 30, intersectionId === selectedIntersection) },
        intersectionId,
      ),
    );
  }
  return out;
}

export function pulseFeatures(frames: PulseFrame[]): PointFeature[] {
  return frames.map((f) => point(f.lng, f.lat, { k: f.kind === 'birth' ? 0 : 1, c: f.color, r: f.r, o: f.o, w: f.w }));
}
