import type { IncidentStatus, IncidentType, Priority } from '@live911/shared';

interface Rule {
  type: IncidentType;
  /** Matched against the upper-cased call type description. */
  patterns: readonly RegExp[];
}

/**
 * Declarative call type -> category table. Order matters (first match wins):
 * violent > property > traffic > welfare > alarm > disturbance > proactive.
 * Unmatched descriptions fall back to `other`.
 */
export const RULES: readonly Rule[] = [
  {
    type: 'violent',
    patterns: [
      /ASSAULT|BATTERY|ROBBERY|HOMICIDE|MURDER|KIDNAP|STABBING/,
      /\bSHOT|SHOOTING/, // SHOTS FIRED, SHOT SPOTTER
      /\bW\/ ?(GUN|KNIFE|WEAPON)/, // PERSON W/GUN, FIGHT W/WEAPONS (not "NO WEAPON")
      /BOMB|EXPLOSI/,
      /RESISTING ARREST/,
    ],
  },
  {
    type: 'property',
    patterns: [
      /BURGLAR|THEFT|LARCENY|SHOPLIFT|STOLEN|FRAUD|EMBEZZL/,
      /VANDAL|GRAFFITI|ARSON/,
      /AUTO BOOST|BREAK(ING)? IN|SNATCH|BROKEN WINDOW/,
      /^RECOVER(Y|ED)? .*VEH/,
    ],
  },
  {
    type: 'traffic',
    patterns: [/ACCIDENT/, /TRAFFIC HAZARD|HAZARD ON ROAD|ROAD HAZARD/, /HIT AND RUN|\bH&R\b|ABANDONED VEH/, /DRUNK DRIVER|\bDUI\b/],
  },
  {
    type: 'welfare',
    patterns: [
      /WELL ?BEING|HOME ?CHECK/,
      /MENTALLY|PSYCH/,
      /MISSING (ADULT|JUVENILE|PERSON)|RUNAWAY/,
      /AIDED CASE|PERSON DOWN|ELDERLY ABUSE|SUICIDE|SENILE|\b416 FOR\b|URGENT NOTIFICATION|BEYOND CONTROL/,
    ],
  },
  { type: 'alarm', patterns: [/\bALARM\b/] },
  {
    type: 'disturbance',
    patterns: [
      /SUSPICIOUS|PROWLER|TRESPASS|STALKING/,
      /\bFIGHT\b|DISTURBANCE|DEMO \/ PROTEST/,
      /NOISE|SCREAMING|DOORBELL/,
      /THREATS|HARASSMENT/,
      /HOMELESS|BLOCKED SIDEWALK|AGGR SOLICITING|PROSTITUTE|SOLICIT/,
      /INTOXICATED|INDECENT EXPOSURE|WANTED VEH|CITIZEN ARREST/,
    ],
  },
  {
    type: 'proactive',
    patterns: [
      /TRAFFIC STOP|TRAF VIOLATION|PASSING CALL|^MEET W\//,
      /STANDBY|PRISONER TRANSPORT|SIT\/LIE|TOW TRUCK|ARREST MADE/,
      /COMM ENGAGEMENT|MONEY COUNT|ENFORCEMENT|SURVEILLANCE|CIVIL PROCESS|WARRANTS?\b|RO SERVICE|MUNI INSPECTION/,
    ],
  },
];

export function mapCallType(description: string): IncidentType {
  const text = description.toUpperCase();
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule.type;
  }
  return 'other';
}

/** A/B/C -> 1/2/3; anything else is treated as normal. */
export function mapPriority(letter: string | undefined): Priority {
  switch (letter?.trim().toUpperCase()) {
    case 'A':
      return 1;
    case 'B':
      return 2;
    default:
      return 3;
  }
}

/** close -> resolved; a real on-scene time (after reception) -> on_scene; otherwise dispatched. */
export function deriveStatus(t: { receivedMs: number; onSceneMs?: number; closedMs?: number }): IncidentStatus {
  if (t.closedMs !== undefined) return 'resolved';
  if (t.onSceneMs !== undefined && t.onSceneMs > t.receivedMs) return 'on_scene';
  return 'dispatched';
}
