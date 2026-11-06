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

/**
 * Calcola i path SVG di un'area impilata (funzione pura, testabile).
 * `only` limita il grafico a un solo tipo.
 */
export function stackSeries(
  points: readonly TimelinePoint[],
  width: number,
  height: number,
  only: IncidentType | null = null,
): StackResult {
  const types: readonly IncidentType[] = only ? [only] : INCIDENT_TYPES;
  const n = points.length;
  if (n === 0) return { paths: [], max: 0, xs: [] };
  const totals = points.map((p) => types.reduce((a, t) => a + (p.byType[t] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const top = 4; // margine superiore
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

export interface StackedArea {
  el: HTMLElement;
  update(points: readonly TimelinePoint[], only?: IncidentType | null): void;
}

const W = 300;
const H = 84;

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
  const axis = h(
    'div',
    { class: 'chart__axis', attrs: { 'aria-hidden': 'true' } },
    h('span', { text: '−60 min' }),
    h('span', { text: '−30' }),
    h('span', { text: 'ora' }),
  );
  const el = h('div', { class: 'chart' }, h('div', { class: 'chart__plot' }, root, maxLabel, readout, empty), axis);

  let pts: readonly TimelinePoint[] = [];
  let only: IncidentType | null = null;
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
    const types: readonly IncidentType[] = only ? [only] : INCIDENT_TYPES;
    const total = types.reduce((a, t) => a + (p.byType[t] ?? 0), 0);
    setText(readout, `${fmtTime(p.t)} · ${fmtInt(total)}`);
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
    update(points, onlyType = null) {
      pts = points;
      only = onlyType;
      stack = stackSeries(points, W, H, only);
      empty.style.display = points.length ? 'none' : 'flex';
      setText(maxLabel, stack.max ? fmtInt(stack.max) : '');
      const keep = new Set<IncidentType>();
      for (const p of stack.paths) {
        keep.add(p.type);
        let pe = pathEls.get(p.type);
        if (!pe) {
          pe = svg('path', { class: 'chart__area', vars: {} });
          pe.setAttribute('fill', TYPE_META[p.type].color);
          pe.setAttribute('stroke', TYPE_META[p.type].color);
          layer.append(pe);
          pathEls.set(p.type, pe);
        }
        pe.setAttribute('d', p.d);
      }
      for (const [t, pe] of pathEls) {
        if (!keep.has(t)) {
          pe.remove();
          pathEls.delete(t);
        }
      }
      const total = points.reduce((a, p) => a + p.total, 0);
      setAttr(root, 'aria-label', `${label}: ${fmtInt(total)} incidenti negli ultimi ${points.length} minuti`);
    },
  };
}
