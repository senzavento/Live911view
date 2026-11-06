import { h, prefersReducedMotion, setText } from './dom';

export interface Kpi {
  el: HTMLElement;
  set(value: number | null): void;
  destroy(): void;
}

export interface KpiOpts {
  label: string;
  format: (n: number) => string;
  /** testo secondario (unità/contesto) */
  hint?: string;
  tone?: 'default' | 'danger';
  animate?: boolean;
}

/** Tessera KPI con animazione numerica leggera (disattivata con prefers-reduced-motion). */
export function createKpi(opts: KpiOpts): Kpi {
  const dd = h('dd', { class: 'kpi__value', text: '–' });
  const el = h(
    'div',
    { class: `kpi${opts.tone === 'danger' ? ' kpi--danger' : ''}` },
    h('dt', { class: 'kpi__label', text: opts.label }),
    dd,
    opts.hint ? h('span', { class: 'kpi__hint', text: opts.hint }) : null,
  );
  let shown: number | null = null;
  let target: number | null = null;
  let raf: number | null = null;
  const animate = opts.animate !== false;

  function stop(): void {
    if (raf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    raf = null;
  }

  return {
    el,
    set(value) {
      if (value === target) return;
      target = value;
      stop();
      if (value === null) {
        shown = null;
        setText(dd, '–');
        return;
      }
      if (shown === null || !animate || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
        shown = value;
        setText(dd, opts.format(value));
        return;
      }
      const from = shown;
      const start = performance.now();
      const dur = 450;
      const tick = (now: number): void => {
        const f = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - f, 3);
        shown = from + (value - from) * eased;
        setText(dd, opts.format(f >= 1 ? value : shown));
        raf = f < 1 ? requestAnimationFrame(tick) : null;
      };
      raf = requestAnimationFrame(tick);
    },
    destroy: stop,
  };
}
