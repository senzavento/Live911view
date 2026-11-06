import type * as maplibregl from 'maplibre-gl';

/** Sprite del conteggio generati su canvas: nessun server di glyph/font necessario (funziona offline). */
const RATIO = 2;

export function labelImageName(text: string): string {
  return `lbl:${text}`;
}

export function ensureLabelImage(map: maplibregl.Map, text: string): void {
  const name = labelImageName(text);
  if (map.hasImage(name)) return;
  const font = `700 ${13 * RATIO}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return;
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 8 * RATIO;
  const h = 20 * RATIO;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5 * RATIO;
  ctx.strokeStyle = 'rgba(8,12,20,0.85)';
  ctx.strokeText(text, w / 2, h / 2 + RATIO);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, w / 2, h / 2 + RATIO);
  map.addImage(name, ctx.getImageData(0, 0, w, h), { pixelRatio: RATIO });
}
