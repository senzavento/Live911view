import type maplibregl from 'maplibre-gl';
import type { ViewLabel } from './levels';

const STYLE_ID = 'l911-map-style';

const CSS = `
.l911-badge{position:absolute;left:12px;top:12px;z-index:2;display:flex;gap:8px;align-items:center;pointer-events:none;
  padding:6px 12px;border-radius:999px;background:rgba(10,15,24,.82);border:1px solid rgba(255,255,255,.14);
  color:#e8eef7;font:600 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.04em;backdrop-filter:blur(6px)}
.l911-badge small{font-weight:500;color:#9fb0c6;letter-spacing:0}
.l911-reset{width:29px;height:29px;display:block;border:0;cursor:pointer;background:#fff;color:#222;font:700 15px/29px system-ui,sans-serif;padding:0}
.l911-reset:focus-visible{outline:2px solid #4d8dff;outline-offset:-2px}
.l911-popup .maplibregl-popup-content{background:rgba(10,15,24,.95);color:#e8eef7;border:1px solid rgba(255,255,255,.16);
  border-radius:10px;padding:10px 28px 10px 12px;font:12px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5)}
.l911-popup .maplibregl-popup-tip{border-top-color:rgba(10,15,24,.95);border-bottom-color:rgba(10,15,24,.95)}
.l911-popup .maplibregl-popup-close-button{color:#9fb0c6;font-size:16px}
.l911-popup b{display:block;font-size:13px;margin-bottom:2px}
.l911-popup span{color:#9fb0c6}
.maplibregl-ctrl-attrib{background:rgba(10,15,24,.7)!important;color:#9fb0c6}
.maplibregl-ctrl-attrib a,.maplibregl-ctrl-attrib-inner{color:#9fb0c6!important}
`;

export function injectStyle(): () => void {
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = CSS;
  document.head.appendChild(st);
  return () => st.remove();
}

/** Indicatore del livello corrente: regione aria-live discreta. */
export class LevelBadge {
  readonly el: HTMLDivElement;
  private readonly main = document.createElement('span');
  private readonly detail = document.createElement('small');
  private text = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'l911-badge';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.el.setAttribute('aria-atomic', 'true');
    this.el.append(this.main, this.detail);
    parent.appendChild(this.el);
  }

  set(label: ViewLabel, detail: string): void {
    const text = `Livello mappa: ${label}${detail ? `, ${detail}` : ''}`;
    if (text === this.text) return;
    this.text = text;
    this.main.textContent = label.toUpperCase();
    this.detail.textContent = detail;
    this.el.setAttribute('aria-label', text);
  }

  destroy(): void {
    this.el.remove();
  }
}

export class ResetControl implements maplibregl.IControl {
  private container: HTMLDivElement | null = null;
  constructor(private readonly onReset: () => void) {}

  onAdd(): HTMLElement {
    const c = document.createElement('div');
    c.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'l911-reset';
    b.textContent = '⌂';
    b.title = 'Reset vista USA';
    b.setAttribute('aria-label', 'Reset vista USA');
    b.addEventListener('click', this.onReset);
    c.appendChild(b);
    this.container = c;
    return c;
  }

  onRemove(): void {
    this.container?.remove();
    this.container = null;
  }
}
