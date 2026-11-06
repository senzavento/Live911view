import type { IncidentType } from './types';

/** Colori/etichette per categoria: UNICA fonte di verità per mappa, legenda e pannelli. */
export const TYPE_META: Record<IncidentType, { label: string; color: string; icon: string }> = {
  violent: { label: 'Violenza / armi', color: '#ff4d5e', icon: '⚡' },
  property: { label: 'Reati patrimoniali', color: '#ff9f43', icon: '🔓' },
  traffic: { label: 'Traffico e incidenti', color: '#ffd43b', icon: '⚠' },
  disturbance: { label: 'Disturbo / sospetto', color: '#b197fc', icon: '👁' },
  welfare: { label: 'Assistenza e benessere', color: '#38d9a9', icon: '✚' },
  alarm: { label: 'Allarmi', color: '#4dabf7', icon: '🔔' },
  proactive: { label: 'Attività di polizia', color: '#8d99a6', icon: '★' },
  other: { label: 'Altro', color: '#c9d1d9', icon: '•' },
};

export const PRIORITY_LABEL = { 1: 'Critica', 2: 'Alta', 3: 'Normale' } as const;

/** Centro e riquadro di San Francisco (lng/lat) per la vista iniziale. */
export const SF_CENTER: [number, number] = [-122.4376, 37.7599];
export const SF_BOUNDS: [[number, number], [number, number]] = [
  [-122.52, 37.70],
  [-122.355, 37.83],
];
