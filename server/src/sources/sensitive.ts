import { TYPE_META, type IncidentType } from '@live911/shared';

/**
 * Call types whose free text must not reach clients (self-harm, domestic violence, sexual offences,
 * mental health, missing persons, minors...). For these the description becomes the generic
 * label of the category. Matched against the upper-cased call type description. Extend as needed.
 */
export const SENSITIVE_DESCRIPTION_PATTERNS: readonly RegExp[] = [
  /SUICID|SELF.?HARM/,
  /\bDV\b|DOMESTIC/,
  /SEXUAL|\bRAPE\b|INDECENT|LEWD|MOLEST|SEX OFFENDER/,
  /MENTAL|PSYCH|\b5150\b|\b416 FOR\b|SENILE|WELL BEING CHECK CA/,
  /MISSING (ADULT|JUVE|PERSON)|RUNAWAY/,
  /JUVE|\bMINOR\b|CHILD|ABUSE|STALKING|HOMECHECK/,
];

export const isSensitiveDescription = (description: string): boolean => {
  const text = description.toUpperCase();
  return SENSITIVE_DESCRIPTION_PATTERNS.some((p) => p.test(text));
};

/** Text shown to clients for a call: the source text, or the category label when delicate. */
export function publicDescription(description: string, type: IncidentType): string {
  return isSensitiveDescription(description) ? TYPE_META[type].label : description;
}
