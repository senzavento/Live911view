import { INCIDENT_TYPES, type IncidentType, type Priority } from '@live911/shared';

export interface TypeProfile {
  /** share of all incidents */
  mix: number;
  /** median seconds from creation to arrival on scene */
  dispatchMedianSec: number;
  /** median seconds on scene before resolution */
  onSceneMedianSec: number;
  /** probabilities for priority 1, 2, 3 */
  priority: readonly [number, number, number];
  minUnits: number;
  descriptions: readonly string[];
  /** relative intensity at a given local hour, mean ~1 over the day */
  activity: (localHour: number) => number;
}

const cycle = (hour: number, peak: number, amplitude: number): number =>
  1 + amplitude * Math.cos((2 * Math.PI * (hour - peak)) / 24);

const bump = (hour: number, centre: number, width: number): number => {
  const d = Math.abs(hour - centre);
  const wrapped = Math.min(d, 24 - d);
  return Math.exp(-(wrapped * wrapped) / (2 * width * width));
};

// Durations are compressed on purpose (minutes, not hours) so that
// ~16 new/s yields a few thousand concurrent incidents.
export const PROFILES: Readonly<Record<IncidentType, TypeProfile>> = {
  medical: {
    mix: 0.45, dispatchMedianSec: 75, onSceneMedianSec: 120, priority: [0.25, 0.4, 0.35], minUnits: 1,
    activity: (h) => cycle(h, 15, 0.25),
    descriptions: [
      'Chest pain, adult patient', 'Difficulty breathing', 'Fall with possible injury', 'Unresponsive person',
      'Allergic reaction', 'Diabetic emergency', 'Seizure activity', 'Suspected overdose',
    ],
  },
  police: {
    mix: 0.23, dispatchMedianSec: 90, onSceneMedianSec: 150, priority: [0.1, 0.35, 0.55], minUnits: 1,
    activity: (h) => cycle(h, 22, 0.45),
    descriptions: [
      'Disturbance reported', 'Suspicious activity', 'Burglary alarm', 'Vehicle theft report',
      'Noise complaint', 'Welfare check', 'Shoplifting in progress', 'Domestic dispute',
    ],
  },
  traffic: {
    mix: 0.15, dispatchMedianSec: 80, onSceneMedianSec: 180, priority: [0.08, 0.32, 0.6], minUnits: 1,
    activity: (h) => 0.45 + 1.1 * bump(h, 8, 1.5) + 1.4 * bump(h, 17, 2.2) + 0.3 * bump(h, 12.5, 2),
    descriptions: [
      'Two-vehicle collision', 'Single-vehicle crash', 'Disabled vehicle blocking lane',
      'Hit and run, no injuries reported', 'Pedestrian struck', 'Debris in roadway', 'Motorcycle crash',
    ],
  },
  fire: {
    mix: 0.08, dispatchMedianSec: 70, onSceneMedianSec: 330, priority: [0.3, 0.45, 0.25], minUnits: 2,
    activity: (h) => cycle(h, 17, 0.3),
    descriptions: [
      'Structure fire', 'Brush fire', 'Vehicle fire', 'Fire alarm activation', 'Smoke investigation',
      'Dumpster fire', 'Kitchen fire',
    ],
  },
  rescue: {
    mix: 0.07, dispatchMedianSec: 100, onSceneMedianSec: 380, priority: [0.35, 0.45, 0.2], minUnits: 2,
    activity: (h) => cycle(h, 14, 0.35),
    descriptions: [
      'Water rescue', 'Person trapped in elevator', 'Vehicle extrication', 'Lost hiker',
      'Confined space rescue', 'Animal rescue', 'Partial structure collapse',
    ],
  },
  hazmat: {
    mix: 0.02, dispatchMedianSec: 120, onSceneMedianSec: 700, priority: [0.2, 0.5, 0.3], minUnits: 3,
    activity: (h) => cycle(h, 11, 0.3),
    descriptions: [
      'Natural gas leak reported', 'Chemical spill', 'Carbon monoxide alarm', 'Unknown odor investigation',
      'Fuel spill', 'Leaking hazardous container',
    ],
  },
};

export const PROFILE_LIST: readonly TypeProfile[] = INCIDENT_TYPES.map((t) => PROFILES[t]);

export function pickPriority(profile: TypeProfile, u: number): Priority {
  const [p1, p2] = profile.priority;
  if (u < p1) return 1;
  return u < p1 + p2 ? 2 : 3;
}
