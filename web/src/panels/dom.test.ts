// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { KeyedList, h, setText } from './dom';

describe('h()', () => {
  it('non interpreta il markup nel testo (anti XSS)', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const el = h('div', { text: evil }, h('span', {}, evil));
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe(evil + evil);
  });
  it('applica classi, attributi, variabili e handler', () => {
    let clicked = 0;
    const el = h('button', {
      class: 'a b',
      attrs: { type: 'button', 'aria-pressed': false, disabled: undefined, 'data-x': 3 },
      vars: { '--c': '#fff' },
      on: { click: () => clicked++ },
    });
    el.click();
    expect(el.className).toBe('a b');
    expect(el.getAttribute('data-x')).toBe('3');
    expect(el.hasAttribute('aria-pressed')).toBe(false);
    expect(el.style.getPropertyValue('--c')).toBe('#fff');
    expect(clicked).toBe(1);
  });
  it('setText non muta se invariato', () => {
    const el = h('p', { text: 'x' });
    const node = el.firstChild;
    setText(el, 'x');
    expect(el.firstChild).toBe(node);
    setText(el, 'y');
    expect(el.textContent).toBe('y');
  });
});

describe('KeyedList', () => {
  const make = (parent: HTMLElement, created: string[]): KeyedList<{ id: string; v: string }> =>
    new KeyedList(
      parent,
      (i) => i.id,
      (i) => {
        created.push(i.id);
        const el = h('li');
        return { el, update: (it) => setText(el, it.v) };
      },
    );

  it('riusa i nodi, riordina e rimuove', () => {
    const ul = h('ul');
    const created: string[] = [];
    const list = make(ul, created);
    list.update([{ id: 'a', v: '1' }, { id: 'b', v: '2' }, { id: 'c', v: '3' }]);
    const [a, b] = [ul.children[0], ul.children[1]];
    list.update([{ id: 'b', v: '2x' }, { id: 'a', v: '1' }]);
    expect(ul.children).toHaveLength(2);
    expect(ul.children[0]).toBe(b);
    expect(ul.children[1]).toBe(a);
    expect(ul.textContent).toBe('2x1');
    expect(created).toEqual(['a', 'b', 'c']); // nessun nodo ricreato
    list.update([{ id: 'c', v: '3' }]);
    expect(created).toEqual(['a', 'b', 'c', 'c']);
    list.clear();
    expect(ul.children).toHaveLength(0);
  });
  it('ignora chiavi duplicate', () => {
    const ul = h('ul');
    const list = make(ul, []);
    list.update([{ id: 'a', v: '1' }, { id: 'a', v: '2' }]);
    expect(ul.children).toHaveLength(1);
  });
});
