import { INCIDENT_TYPES, TYPE_META, type IncidentType, type TypeCounts } from '@live911/shared';
import { KeyedList, h, setAttr, setText, toggleClass } from '../dom';
import { fmtInt } from '../format';
import { typeLabelLong } from '../scope';

export interface TypeBars {
  el: HTMLElement;
  update(counts: TypeCounts, selected?: IncidentType | null, hidden?: readonly IncidentType[]): void;
}

interface BarItem {
  type: IncidentType;
  value: number;
  pct: number;
  selected: boolean;
  dim: boolean;
}

/** Tipi ordinati per conteggio decrescente (stabile sull'ordine di INCIDENT_TYPES). */
export function sortTypes(counts: TypeCounts): IncidentType[] {
  return INCIDENT_TYPES.slice().sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
}

/**
 * Ripartizione per tipologia: barre orizzontali. Se `onSelect` è fornito le righe sono
 * pulsanti (toggle, aria-pressed) usati come filtro visivo locale.
 */
export function createTypeBars(onSelect?: (t: IncidentType | null) => void): TypeBars {
  const ul = h('ul', { class: 'bars' });
  let selected: IncidentType | null = null;

  const list = new KeyedList<BarItem>(
    ul,
    (i) => i.type,
    (first) => {
      const t = first.type;
      const meta = TYPE_META[t];
      const val = h('span', { class: 'bars__val' });
      const fill = h('span', { class: 'bars__fill' });
      const head = h(
        'span',
        { class: 'bars__head' },
        h('span', { class: 'dot', attrs: { 'aria-hidden': 'true' } }),
        h('span', { class: 'bars__label', text: typeLabelLong(t), attrs: { title: typeLabelLong(t) } }),
        val,
      );
      const track = h('span', { class: 'bars__track', attrs: { 'aria-hidden': 'true' } }, fill);
      const inner = onSelect
        ? h('button', {
            class: 'bars__item',
            attrs: { type: 'button', 'aria-pressed': 'false' },
            on: { click: () => onSelect(selected === t ? null : t) },
          })
        : h('div', { class: 'bars__item' });
      inner.append(head, track);
      const li = h('li', { class: 'bars__row', vars: { '--c': meta.color } }, inner);
      return {
        el: li,
        update(item) {
          setText(val, fmtInt(item.value));
          const w = `${item.pct}%`;
          if (fill.style.width !== w) fill.style.width = w;
          toggleClass(li, 'is-active', item.selected);
          toggleClass(li, 'is-dim', item.dim);
          if (onSelect) setAttr(inner, 'aria-pressed', item.selected ? 'true' : 'false');
          else setAttr(li, 'aria-label', `${typeLabelLong(t)}: ${fmtInt(item.value)}`);
        },
      };
    },
  );

  return {
    el: ul,
    update(counts, sel = null, hidden = []) {
      selected = sel;
      const max = Math.max(1, ...INCIDENT_TYPES.filter((t) => !hidden.includes(t)).map((t) => counts[t] ?? 0));
      list.update(
        sortTypes(counts).filter((t) => !hidden.includes(t)).map((type) => ({
          type,
          value: counts[type] ?? 0,
          pct: Math.round(((counts[type] ?? 0) / max) * 100),
          selected: sel === type,
          dim: sel !== null && sel !== type,
        })),
      );
    },
  };
}
