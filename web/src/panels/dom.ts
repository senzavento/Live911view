/**
 * Piccoli helper DOM tipizzati. Nessun innerHTML: tutto il testo passa da textContent,
 * quindi i dati dinamici non possono iniettare markup.
 */

export type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  id?: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  /** Custom properties CSS (es. { '--c': '#fff' }). */
  vars?: Record<string, string>;
  on?: {
    click?: (e: MouseEvent) => void;
    input?: (e: Event) => void;
    keydown?: (e: KeyboardEvent) => void;
    pointermove?: (e: PointerEvent) => void;
    pointerleave?: (e: PointerEvent) => void;
  };
}

function applyProps(node: Element, props?: Props): void {
  if (!props) return;
  if (props.class) node.setAttribute('class', props.class);
  if (props.id) node.id = props.id;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) {
      if (v === undefined || v === null || v === false) continue;
      node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  if (props.vars && node instanceof HTMLElement) {
    for (const [k, v] of Object.entries(props.vars)) node.style.setProperty(k, v);
  }
  if (props.on) {
    const on = props.on;
    if (on.click) node.addEventListener('click', on.click as EventListener);
    if (on.input) node.addEventListener('input', on.input);
    if (on.keydown) node.addEventListener('keydown', on.keydown as EventListener);
    if (on.pointermove) node.addEventListener('pointermove', on.pointermove as EventListener);
    if (on.pointerleave) node.addEventListener('pointerleave', on.pointerleave as EventListener);
  }
}

function appendChildren(node: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'number' ? String(c) : c);
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyProps(node, props);
  appendChildren(node, children);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  props?: Props,
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  applyProps(node, props);
  appendChildren(node, children);
  return node;
}

/** Aggiorna textContent solo se cambia (evita mutazioni DOM inutili). */
export function setText(node: Node, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function setAttr(node: Element, name: string, value: string | null): void {
  if (value === null) {
    if (node.hasAttribute(name)) node.removeAttribute(name);
  } else if (node.getAttribute(name) !== value) {
    node.setAttribute(name, value);
  }
}

export function toggleClass(node: Element, cls: string, on: boolean): void {
  if (node.classList.contains(cls) !== on) node.classList.toggle(cls, on);
}

export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export interface Row<T> {
  el: HTMLElement;
  update(item: T, index: number): void;
}

/**
 * Lista con chiavi: crea/riusa/rimuove solo i nodi necessari e riordina con il minimo di
 * mutazioni (nessun re-render totale).
 */
export class KeyedList<T> {
  private rows = new Map<string, Row<T>>();

  constructor(
    readonly parent: HTMLElement,
    private readonly keyOf: (item: T) => string,
    private readonly create: (item: T) => Row<T>,
  ) {}

  get size(): number {
    return this.rows.size;
  }

  update(items: readonly T[]): void {
    const seen = new Set<string>();
    let i = 0;
    for (const item of items) {
      const key = this.keyOf(item);
      if (seen.has(key)) continue;
      seen.add(key);
      let row = this.rows.get(key);
      if (!row) {
        row = this.create(item);
        this.rows.set(key, row);
      }
      row.update(item, i);
      if (this.parent.children[i] !== row.el) this.parent.insertBefore(row.el, this.parent.children[i] ?? null);
      i++;
    }
    for (const [key, row] of this.rows) {
      if (!seen.has(key)) {
        row.el.remove();
        this.rows.delete(key);
      }
    }
  }

  clear(): void {
    for (const row of this.rows.values()) row.el.remove();
    this.rows.clear();
  }
}

/** Esegue `fn` al massimo una volta per frame. */
export function rafThrottle(fn: () => void): { run: () => void; cancel: () => void } {
  let id: number | null = null;
  const hasRaf = typeof requestAnimationFrame === 'function';
  const run = (): void => {
    if (id !== null) return;
    const cb = (): void => {
      id = null;
      fn();
    };
    id = hasRaf ? requestAnimationFrame(cb) : (setTimeout(cb, 16) as unknown as number);
  };
  const cancel = (): void => {
    if (id === null) return;
    if (hasRaf) cancelAnimationFrame(id);
    else clearTimeout(id);
    id = null;
  };
  return { run, cancel };
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
