import { h } from './dom';

export interface Layout {
  setDetailOpen(open: boolean): void;
  toggleSidebar(force?: boolean): void;
  sidebarOpen(): boolean;
  destroy(): void;
}

/**
 * Gestisce le classi di stato sul contenitore #app (drawer/bottom sheet su mobile,
 * colonna detail su desktop), lo scrim e il tasto Esc per chiudere il drawer.
 */
export function createLayout(anchor: HTMLElement): Layout {
  const app = anchor.parentElement ?? anchor;
  const scrim = h('div', {
    class: 'scrim',
    attrs: { 'aria-hidden': 'true' },
    on: { click: () => toggle(false) },
  });
  app.append(scrim);
  app.classList.add('panels-ready');

  function toggle(force?: boolean): void {
    const on = force ?? !app.classList.contains('sidebar-open');
    app.classList.toggle('sidebar-open', on);
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && app.classList.contains('sidebar-open')) toggle(false);
  };
  document.addEventListener('keydown', onKey);

  return {
    setDetailOpen(open) {
      app.classList.toggle('has-detail', open);
      if (open) app.classList.remove('sidebar-open');
    },
    toggleSidebar: toggle,
    sidebarOpen: () => app.classList.contains('sidebar-open'),
    destroy() {
      document.removeEventListener('keydown', onKey);
      scrim.remove();
      app.classList.remove('panels-ready', 'has-detail', 'sidebar-open');
    },
  };
}
