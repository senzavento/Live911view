export const WINDOW_MINUTES = 1440;
const MINUTE_MS = 60_000;

/**
 * 24h of per-minute counters over several channels, with O(1) running totals.
 * Memory is fixed; expired minutes are subtracted as the head moves forward.
 */
export class MinuteRing {
  private readonly data: Int32Array;
  private readonly totals: Float64Array;
  private head: number | null = null;

  constructor(private readonly channels: number) {
    this.data = new Int32Array(WINDOW_MINUTES * channels);
    this.totals = new Float64Array(channels);
  }

  add(channel: number, atMs: number, value: number): void {
    const minute = Math.floor(atMs / MINUTE_MS);
    if (this.head === null) this.head = minute;
    else if (minute > this.head) this.advance(minute);
    else if (minute <= this.head - WINDOW_MINUTES) return;
    const idx = this.slot(minute) * this.channels + channel;
    this.data[idx] = (this.data[idx] as number) + value;
    this.totals[channel] = (this.totals[channel] as number) + value;
  }

  advanceTo(nowMs: number): void {
    const minute = Math.floor(nowMs / MINUTE_MS);
    if (this.head !== null && minute > this.head) this.advance(minute);
  }

  /** Sum over the whole 24h window. */
  total(channel: number, nowMs: number): number {
    this.advanceTo(nowMs);
    return this.totals[channel] as number;
  }

  /** Per-minute values for the last `minutes` minutes (oldest first, current minute last). */
  series(channel: number, nowMs: number, minutes: number): number[] {
    this.advanceTo(nowMs);
    const nowMinute = Math.floor(nowMs / MINUTE_MS);
    const out: number[] = [];
    for (let m = nowMinute - minutes + 1; m <= nowMinute; m++) {
      const inWindow = this.head !== null && m <= this.head && m > this.head - WINDOW_MINUTES;
      out.push(inWindow ? (this.data[this.slot(m) * this.channels + channel] as number) : 0);
    }
    return out;
  }

  windowSum(channel: number, nowMs: number, minutes: number): number {
    return this.series(channel, nowMs, minutes).reduce((a, b) => a + b, 0);
  }

  private slot(minute: number): number {
    return ((minute % WINDOW_MINUTES) + WINDOW_MINUTES) % WINDOW_MINUTES;
  }

  private advance(toMinute: number): void {
    const head = this.head as number;
    const steps = Math.min(toMinute - head, WINDOW_MINUTES);
    for (let i = 1; i <= steps; i++) {
      const base = this.slot(head + i) * this.channels;
      for (let ch = 0; ch < this.channels; ch++) {
        this.totals[ch] = (this.totals[ch] as number) - (this.data[base + ch] as number);
        this.data[base + ch] = 0;
      }
    }
    this.head = toMinute;
  }
}
