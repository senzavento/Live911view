import type { Priority } from '@live911/shared';

const LOCALE = 'it-IT';
/** Fuso orario dei timestamp mostrati: i dati sono di San Francisco. */
export const SF_TZ = 'America/Los_Angeles';

const intFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const oneDec = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const compactFmt = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });
const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: SF_TZ });
const timeSecFmt = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZone: SF_TZ,
});
const dayFmt = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', timeZone: SF_TZ });
const tzNameFmt = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short', timeZone: SF_TZ });

export function fmtInt(n: number): string {
  return Number.isFinite(n) ? intFmt.format(n) : '–';
}

export function fmtDecimal(n: number): string {
  return Number.isFinite(n) ? oneDec.format(n) : '–';
}

export function fmtCompact(n: number): string {
  return Number.isFinite(n) ? compactFmt.format(n) : '–';
}

/** Durata in secondi → "45 s", "2 min 05 s", "1 h 03 min". */
export function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '–';
  const s = Math.round(sec);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  const hh = Math.floor(m / 60);
  return `${hh} h ${String(m % 60).padStart(2, '0')} min`;
}

/** Ritardo in secondi → "< 1 min", "15 min", "1 h 05 min". */
export function fmtDelay(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '–';
  const m = Math.round(sec / 60);
  if (m < 1) return '< 1 min';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** Tempo trascorso in ms → "mm:ss" oppure "h:mm:ss". */
export function fmtElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '00:00';
  const total = Math.floor(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const hh = Math.floor(total / 3600);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

function toDate(iso: string | number | Date): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Ora di San Francisco "14:20" (o "14:20:56"). */
export function fmtTime(iso: string | number | Date, withSeconds = false): string {
  const d = toDate(iso);
  if (!d) return '–';
  return (withSeconds ? timeSecFmt : timeFmt).format(d);
}

/** "PST" / "PDT" per l'istante dato. */
export function sfTzName(iso: string | number | Date): string {
  const d = toDate(iso);
  if (!d) return '';
  return tzNameFmt.formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? '';
}

/** "14:20 PST" */
export function fmtTimeTz(iso: string | number | Date, withSeconds = false): string {
  const t = fmtTime(iso, withSeconds);
  return t === '–' ? t : `${t} ${sfTzName(iso)}`.trim();
}

/** "06/11, 14:20" (ora di San Francisco) */
export function fmtDayTime(iso: string | number | Date): string {
  const d = toDate(iso);
  return d ? `${dayFmt.format(d)}, ${timeFmt.format(d)}` : '–';
}

/** "adesso", "3 min fa", "2 h fa". */
export function fmtAgo(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '–';
  const s = Math.floor(Math.max(0, now - t) / 1000);
  if (s < 10) return 'adesso';
  if (s < 60) return `${s} s fa`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min fa`;
  return `${Math.floor(m / 60)} h fa`;
}

export function fmtPct(part: number, total: number): string {
  if (!total) return '0%';
  return `${intFmt.format(Math.round((part / total) * 100))}%`;
}

export const STATUS_LABEL = {
  dispatched: 'Inviata',
  on_scene: 'Sul posto',
  resolved: 'Risolta',
} as const;

export function priorityShort(p: Priority): string {
  return p === 1 ? 'P1' : p === 2 ? 'P2' : 'P3';
}

/** Accorcia un id lungo per la visualizzazione (breadcrumb). */
export function shortId(id: string): string {
  return id.length > 9 ? `#${id.slice(-7)}` : `#${id}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Tronca un testo (es. messaggio d'errore della sorgente) per la visualizzazione. */
export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
