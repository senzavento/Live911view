import { describe, expect, it } from 'vitest';
import { CITIES } from '../data/cities';
import { STATES } from '../data/states';
import type { SourceEvent } from '../source';
import { Simulator } from './simulator';

const NOW = Date.UTC(2026, 10, 6, 18, 0, 0);

function run(seed: number): SourceEvent[] {
  const sim = new Simulator({ cities: CITIES, ratePerSec: 8, seed });
  const events: SourceEvent[] = [];
  sim.subscribe((e) => events.push(e));
  sim.tick(NOW);
  for (let m = 1; m <= 15; m++) sim.tick(NOW + m * 60_000);
  return events;
}

describe('datasets', () => {
  it('covers 50 states + DC with unique city ids', () => {
    expect(STATES).toHaveLength(51);
    expect(CITIES.length).toBeGreaterThanOrEqual(120);
    expect(new Set(CITIES.map((c) => c.id)).size).toBe(CITIES.length);
    const codes = new Set(STATES.map((s) => s.code));
    expect(new Set(CITIES.map((c) => c.state))).toEqual(codes);
  });
});

describe('Simulator', () => {
  it('is deterministic for a given seed', () => {
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  it('walks incidents through dispatched -> on_scene -> resolved', () => {
    const events = run(3);
    const seen = new Map<string, string[]>();
    for (const e of events) {
      if (e.kind === 'history') continue;
      seen.set(e.incident.id, [...(seen.get(e.incident.id) ?? []), e.incident.status]);
    }
    const complete = [...seen.values()].filter((s) => s.length === 3);
    expect(complete.length).toBeGreaterThan(0);
    for (const path of complete) expect(path).toEqual(['dispatched', 'on_scene', 'resolved']);
    for (const path of seen.values()) expect(path[0]).toBe('dispatched');
  });

  it('produces valid, plausible incidents', () => {
    const cityById = new Map(CITIES.map((c) => [c.id, c]));
    const created = run(5).flatMap((e) => (e.kind === 'created' ? [e.incident] : []));
    expect(created.length).toBeGreaterThan(500);
    for (const i of created) {
      const c = cityById.get(i.cityId);
      expect(c).toBeDefined();
      expect(i.state).toBe(c?.state);
      expect(Math.abs(i.lat - (c?.lat ?? 0))).toBeLessThan(1);
      expect(Math.abs(i.lng - (c?.lng ?? 0))).toBeLessThan(1);
      expect(i.address).toMatch(/^\d+ block of /);
    }
    const medical = created.filter((i) => i.type === 'medical').length / created.length;
    expect(medical).toBeGreaterThan(0.38);
    expect(medical).toBeLessThan(0.52);
  });

  it('reaches a few thousand active incidents after priming at the default rate', () => {
    const sim = new Simulator({ cities: CITIES, ratePerSec: 16, seed: 1 });
    sim.prime(NOW);
    expect(sim.activeCount).toBeGreaterThan(3000);
    expect(sim.activeCount).toBeLessThan(6500);
  });
});
