import type { IncidentType } from './types';

/** Colori/etichette per tipologia: UNICA fonte di verità per mappa, legenda e pannelli. */
export const TYPE_META: Record<IncidentType, { label: string; color: string; icon: string }> = {
  fire: { label: 'Incendio', color: '#ff5a36', icon: '🔥' },
  medical: { label: 'Medico', color: '#2ee6a6', icon: '✚' },
  police: { label: 'Polizia', color: '#4d8dff', icon: '★' },
  traffic: { label: 'Incidente stradale', color: '#ffc233', icon: '⚠' },
  hazmat: { label: 'Materiali pericolosi', color: '#c75bff', icon: '☢' },
  rescue: { label: 'Soccorso', color: '#27d3ee', icon: '⛑' },
};

export const PRIORITY_LABEL = { 1: 'Critica', 2: 'Alta', 3: 'Normale' } as const;
