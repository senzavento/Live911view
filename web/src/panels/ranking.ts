import { KeyedList, h, setAttr, setText, toggleClass } from './dom';

export interface RankItem {
  key: string;
  name: string;
  /** sigla/etichetta secondaria (es. codice stato) */
  tag?: string;
  valueText: string;
  /** 0..100 */
  pct: number;
  current?: boolean;
  /** quota di incidenti critici, per marcare la riga */
  critical?: number;
}

export interface Ranking {
  el: HTMLElement;
  update(items: readonly RankItem[]): void;
}

/** Classifica cliccabile con barra proporzionale. */
export function createRanking(onPick: (key: string) => void, label: string): Ranking {
  const ol = h('ol', { class: 'rank', attrs: { 'aria-label': label } });
  const list = new KeyedList<RankItem>(
    ol,
    (i) => i.key,
    (first) => {
      const idx = h('span', { class: 'rank__idx' });
      const name = h('span', { class: 'rank__name' });
      const tag = h('span', { class: 'rank__tag' });
      const val = h('span', { class: 'rank__val' });
      const fill = h('span', { class: 'rank__fill' });
      const btn = h(
        'button',
        { class: 'rank__btn', attrs: { type: 'button' }, on: { click: () => onPick(first.key) } },
        idx,
        h('span', { class: 'rank__main' }, h('span', { class: 'rank__line' }, name, tag), h('span', { class: 'rank__track', attrs: { 'aria-hidden': 'true' } }, fill)),
        val,
      );
      const li = h('li', { class: 'rank__row' }, btn);
      return {
        el: li,
        update(item, i) {
          setText(idx, String(i + 1));
          setText(name, item.name);
          setText(tag, item.tag ?? '');
          setText(val, item.valueText);
          const w = `${item.pct}%`;
          if (fill.style.width !== w) fill.style.width = w;
          toggleClass(li, 'is-current', !!item.current);
          setAttr(btn, 'aria-current', item.current ? 'true' : null);
        },
      };
    },
  );
  return { el: ol, update: (items) => list.update(items) };
}
