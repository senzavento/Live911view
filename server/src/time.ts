/**
 * The source publishes wall-clock times in San Francisco local time without an
 * offset. Conversion uses Intl only (no tz database dependency).
 */
const ZONE = 'America/Los_Angeles';
const DAY_MS = 86_400_000;

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Wall-clock parts in San Francisco for an instant. */
function sfParts(utcMs: number): Parts {
  const out: Record<string, number> = {};
  for (const p of formatter.formatToParts(new Date(utcMs))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year as number,
    month: out.month as number,
    day: out.day as number,
    hour: out.hour as number,
    minute: out.minute as number,
    second: out.second as number,
  };
}

const partsAsUtc = (p: Parts): number => Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);

/** SF offset from UTC at an instant, in ms (negative: -7h PDT, -8h PST). */
function offsetAt(utcMs: number): number {
  // Intl never reports milliseconds, so compare at whole-second precision.
  const whole = Math.floor(utcMs / 1000) * 1000;
  return partsAsUtc(sfParts(whole)) - whole;
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3})\d*)?$/;

/**
 * Parses "YYYY-MM-DDTHH:mm:ss[.fff]" read as San Francisco local time and returns epoch ms (UTC),
 * or undefined if the text is not a valid local date-time.
 * Ambiguous times (clocks going back, 01:xx once a year) resolve to the first occurrence (PDT);
 * non-existent times (clocks going forward, 02:xx) shift forward by the skipped hour.
 */
export function sfLocalToUtc(text: string): number | undefined {
  const m = LOCAL.exec(text);
  if (!m) return undefined;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const millis = m[7] ? Number(m[7].padEnd(3, '0')) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return undefined;
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  if (new Date(asUtc).getUTCDate() !== day) return undefined; // e.g. 31 November
  const before = offsetAt(asUtc - DAY_MS);
  const after = offsetAt(asUtc + DAY_MS);
  const candidates = [...new Set([before, after])]
    .map((offset) => asUtc - offset)
    .filter((utc) => offsetAt(utc) === asUtc - utc);
  const utc = candidates.length > 0 ? Math.min(...candidates) : asUtc - before;
  return utc + millis;
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** Formats an instant as San Francisco local "YYYY-MM-DDTHH:mm:ss" (for SoQL filters). */
export function utcToSfLocal(utcMs: number): string {
  const p = sfParts(utcMs);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}
