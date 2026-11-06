import { INCIDENT_TYPES, TYPE_META, type IncidentType, type TimelinePoint } from '@live911/shared';
import { h, setAttr, setText, svg } from '../dom';
import { fmtInt, fmtTime } from '../format';

export interface StackPath {
  type: IncidentType;
  d: string;
}

export interface StackResult {
  paths: StackPath[];
  max: number;
  /** ascisse (0..width) dei punti */
  xs: number[];
}

/** Totale di un bucket sui soli `types`. */
export function bucketTotal(p: TimelinePoint, types: readonly IncidentType[]): number {
  return types.reduce((a, t) => a + (p.byType[t] ?? 0), 0);
}

/**
 * Calcola i path SVG di un'area impilata (funzione pura, testabile).
 * `types` limita le categorie incluse (default: tutte).
 */
export function stackSeries(
  points: readonly TimelinePoint[],
  width: number,
  height: number,
  types: readonly IncidentType[] = INCIDENT_TYPES,
): StackResult {
  const n = points.length;
  if (n === 0) return { paths: [], max: 0, xs: [] };
  const max = Math.max(1, ...points.map((p) => bucketTotal(p, types)));
  const top = 4;
  const plotH = height - top;
  const xs = points.map((_, i) => (n === 1 ? width / 2 : (i / (n - 1)) * width));
  const y = (v: number): number => top + plotH - (v / max) * plotH;

  const cum = points.map(() => 0);
  const paths: StackPath[] = [];
  for (const type of types) {
    const lower = cum.slice();
    const upper = points.map((p, i) => (cum[i] ?? 0) + (p.byType[type] ?? 0));
    upper.forEach((v, i) => (cum[i] = v));
    let d = '';
    upper.forEach((v, i) => {
      d += `${i === 0 ? 'M' : 'L'}${(xs[i] ?? 0).toFixed(1)} ${y(v).toFixed(1)}`;
    });
    for (let i = n - 1; i >= 0; i--) d += `L${(xs[i] ?? 0).toFixed(1)} ${y(lower[i] ?? 0).toFixed(1)}`;
    paths.push({ type, d: `${d}Z` });
  }
  return { paths, max, xs };
}

/** Bucket con il totale più alto (null se vuoto o tutto a zero). */
export function peakOf(points: readonly TimelinePoint[], types: readonly IncidentType[] = INCIDENT_TYPES): { t: string; total: number } | null {
  let best: { t: string; total: number } | null = null;
  for (const p of points) {
    const total = bucketTotal(p, types);
    if (total > 0 && (!best || total > best.total)) best = { t: p.t, total };
  }
  return best;
}

export interface StackedArea {
  el: HTMLElement;
  update(points: readonly TimelinePoint[], types?: readonly IncidentType[]): void;
}

const W = 300;
const H = 84;

/** Timeline a 24 bucket orari, area impilata per categoria (SVG, nessuna libreria). */
export function createStackedArea(label: string): StackedArea {
  const guide = svg('line', { class: 'chart__guide', attrs: { y1: 0, y2: H } });
  guide.style.display = 'none';
  const gridLines = [0.25, 0.5, 0.75].map((f) =>
    svg('line', { class: 'chart__grid', attrs: { x1: 0, x2: W, y1: 4 + (H - 4) * f, y2: 4 + (H - 4) * f } }),
  );
  const layer = svg('g');
  const root = svg('svg', {
    class: 'chart__svg',
    attrs: { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': label, focusable: 'false' },
  });
  root.append(...gridLines, layer, guide);

  const readout = h('div', { class: 'chart__readout', attrs: { 'aria-hidden': 'true' } });
  const maxLabel = h('span', { class: 'chart__ymax', attrs: { 'aria-hidden': 'true' } });
  const empty = h('div', { class: 'chart__empty', text: 'Nessun dato nella finestra' });
  const peak = h('p', { class: 'chart__peak' });
  const axis = h(
    'div',
    { class: 'chart__axis', attrs: { 'aria-hidden': 'true' } },
    h('span', { text: '−24 h' }),
    h('span', { text: '−12 h' }),
    h('span', { text: 'ora' }),
  );
  const el = h('div', { class: 'chart' }, h('div', { class: 'chart__plot' }, root, maxLabel, readout, empty), axis, peak);

  let pts: readonly TimelinePoint[] = [];
  let shown: readonly IncidentType[] = INCIDENT_TYPES;
  let stack: StackResult = { paths: [], max: 0, xs: [] };
  const pathEls = new Map<IncidentType, SVGPathElement>();

  function onMove(e: PointerEvent): void {
    if (!pts.length) return;
    const rect = root.getBoundingClientRect();
    if (rect.width === 0) return;
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const i = Math.round(f * (pts.length - 1));
    const p = pts[i];
    const x = stack.xs[i];
    if (!p || x === undefined) return;
    guide.setAttribute('x1', String(x));
    guide.setAttribute('x2', String(x));
    guide.style.display = '';
    setText(readout, `${fmtTime(p.t)} · ${fmtInt(bucketTotal(p, shown))}`);
    readout.style.display = 'block';
  }
  function onLeave(): void {
    guide.style.display = 'none';
    readout.style.display = 'none';
  }
  root.addEventListener('pointermove', onMove as EventListener);
  root.addEventListener('pointerleave', onLeave);

  return {
    el,
    update(points, types = INCIDENT_TYPES) {
      pts = points;
      shown = types;
      stack = stackSeries(points, W, H, types);
      empty.style.display = points.length ? 'none' : 'flex';
      setText(maxLabel, stack.max && points.length ? fmtInt(stack.max) : '');
      const keep = new Set<IncidentType>();
      for (const p of stack.paths) {
        keep.add(p.type);
        let pe = pathEls.get(p.type);
        if (!pe) {
          pe = svg('path', { class: 'chart__area' });
          pe.setAttribute('fill', TYPE_META[p.type].color);
          pe.setAttribute('stroke', TYPE_META[p.type].color);
          layer.append(pe);
          pathEls.set(p.type, pe);
        }
        pe.setAttribute('d', p.d);
      }
      // mantiene l'ordine di impilamento
      for (const p of stack.paths) {
        const pe = pathEls.get(p.type);
        if (pe) layer.append(pe);
      }
      for (const [t, pe] of pathEls) {
        if (!keep.has(t)) {
          pe.remove();
          pathEls.delete(t);
        }
      }
      const total = points.reduce((a, p) => a + bucketTotal(p, types), 0);
      const pk = peakOf(points, types);
      setText(peak, pk ? `Picco alle ${fmtTime(pk.t)}: ${fmtInt(pk.total)} chiamate/ora · ora di San Francisco` : '');
      setAttr(root, 'aria-label', `${label}: ${fmtInt(total)} chiamate in ${points.length} ore${pk ? `, picco alle ${fmtTime(pk.t)} con ${fmtInt(pk.total)}` : ''}`);
    },
  };
}
