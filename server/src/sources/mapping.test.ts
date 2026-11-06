import type { IncidentType } from '@live911/shared';
import { describe, expect, it } from 'vitest';
import { deriveStatus, mapCallType, mapPriority } from './mapping';
import { isSensitiveDescription, publicDescription } from './sensitive';

// Real call type descriptions from gnap-fj3t.
const CASES: Record<IncidentType, string[]> = {
  violent: ['ASSAULT / BATTERY', 'AGG ASSAULT / ADW', 'ASSAULT / BATTERY DV', 'STRONGARM ROBBERY', 'ROBBERY', 'PERSON W/GUN',
    'PERSON W/KNIFE', 'SHOTS FIRED', 'SHOOTING', 'SHOT SPOTTER', 'STABBING', 'FIGHT W/WEAPONS', 'KIDNAPPING', 'BOMB THREAT',
    'EXPLOSIVE FOUND', 'SEXUAL ASSAULT ADULT', 'RESISTING ARREST'],
  property: ['BURGLARY', 'PETTY THEFT', 'GRAND THEFT', 'VANDALISM', 'AUTO BOOST / STRIP', 'STOLEN VEHICLE', 'FRAUD',
    'PERSON BREAKING IN', 'RECOVER MISSING VEH', 'PURSE SNATCH'],
  traffic: ['VEH ACCIDENT', 'INJURY VEH ACCIDENT', 'H&R VEH ACCIDENT', 'H&R INJURY ACCIDENT', 'TRAFFIC HAZARD', 'DRUNK DRIVER'],
  welfare: ['WELL BEING CHECK', 'MENTALLY DISTURBED', 'MISSING ADULT', 'MISSING JUVENILE', 'AIDED CASE', 'SUICIDE ATTEMPT',
    'Psych escort', '416 for medication', 'SENILE PERSON', 'PERSON DOWN', 'Homecheck'],
  alarm: ['AUDIBLE ALARM', 'SILENT ALARM', 'PANIC ALARM', 'VEHICLE ALARM', 'SILENT HOLDUP ALARM', 'MUNI ALARM'],
  disturbance: ['SUSPICIOUS PERSON', 'SUSPICIOUS VEHICLE', 'FIGHT NO WEAPON', 'TRESPASSER', 'NOISE NUISANCE', 'THREATS / HARASSMENT',
    'HOMELESS COMPLAINT', 'PROWLER', 'PERSON SCREAMING', 'RINGING DOORBELL', 'INDECENT EXPOSURE', 'WANTED VEHICLE / SUB',
    'BLOCKED SIDEWALK', 'FIGHT NO WEAPON DV'],
  proactive: ['TRAFFIC STOP', 'TRAF VIOLATION CITE', 'TRAF VIOLATION TOW', 'PASSING CALL', 'MEET W/CITY EMPLOYEE', 'MEET W/CITIZEN',
    'MEET W/OFFICER', 'CITIZEN STANDBY', 'PRISONER TRANSPORT', 'SIT/LIE ENFORCEMENT', 'TOW TRUCK', 'ARREST MADE', 'Money Counts'],
  other: ['COMPLAINT UNKN', 'MISC', 'FIRE', 'MARINE', 'SOMETHING NEW'],
};

describe('mapCallType', () => {
  for (const [type, descriptions] of Object.entries(CASES)) {
    it.each(descriptions)(`${type}: %s`, (description) => {
      expect(mapCallType(description)).toBe(type);
    });
  }

  it('is case-insensitive and total', () => {
    expect(mapCallType('well being check')).toBe('welfare');
    expect(mapCallType('')).toBe('other');
  });
});

describe('mapPriority', () => {
  it.each([['A', 1], ['B', 2], ['C', 3], ['b', 2], ['', 3], ['Z', 3], [undefined, 3]] as const)('%j -> %j', (letter, expected) => {
    expect(mapPriority(letter)).toBe(expected);
  });
});

describe('deriveStatus', () => {
  const received = 1000;
  it('resolved when closed', () => expect(deriveStatus({ receivedMs: received, closedMs: 2000, onSceneMs: 1500 })).toBe('resolved'));
  it('on_scene when on scene after reception', () => expect(deriveStatus({ receivedMs: received, onSceneMs: 1500 })).toBe('on_scene'));
  it('dispatched when on-scene equals reception (officer-initiated)', () => expect(deriveStatus({ receivedMs: received, onSceneMs: received })).toBe('dispatched'));
  it('dispatched by default', () => expect(deriveStatus({ receivedMs: received })).toBe('dispatched'));
});

describe('sensitive descriptions', () => {
  it.each(['SUICIDE ATTEMPT', 'FIGHT NO WEAPON DV', 'ASSAULT / BATTERY DV', 'SEXUAL ASSAULT JUVE', 'INDECENT EXPOSURE', 'MENTALLY DISTURBED',
    'MISSING ADULT', 'MISSING JUVENILE', 'Psych escort', 'JUVE BEYOND CONTROL', 'STALKING', 'DOMESTIC VIOLENCE'])('hides %s', (d) => {
    expect(isSensitiveDescription(d)).toBe(true);
    expect(publicDescription(d, 'welfare')).toBe('Assistenza e benessere');
  });

  it.each(['SUSPICIOUS PERSON', 'BURGLARY', 'RECOVER MISSING VEH', 'TRAFFIC STOP', 'WELL BEING CHECK'])('keeps %s', (d) => {
    expect(isSensitiveDescription(d)).toBe(false);
    expect(publicDescription(d, 'other')).toBe(d);
  });

  it('uses the label of the mapped category', () => {
    expect(publicDescription('ASSAULT / BATTERY DV', 'violent')).toBe('Violenza / armi');
  });
});
