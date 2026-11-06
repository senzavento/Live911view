import type { IncidentStatus } from './types';

/** In corso = né chiusa né scaduta. */
export const isLive = (status: IncidentStatus): boolean => status === 'dispatched' || status === 'on_scene';
