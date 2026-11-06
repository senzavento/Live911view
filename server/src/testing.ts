import { buildApp } from './app';
import { createRuntime, type Runtime } from './runtime';
import { Simulator } from './sim/simulator';

export const T0 = Date.UTC(2026, 10, 6, 18, 0, 0);

/** Runtime driven by a virtual clock: nothing runs until the test advances time. */
export function testRuntime(seed = 42, rate = 16): { rt: Runtime; sim: Simulator; setNow: (t: number) => void } {
  let now = T0;
  const rt = createRuntime({ seed, rate, clock: () => now, stream: { flushMs: 20 } });
  const sim = rt.source as Simulator;
  return {
    rt,
    sim,
    setNow: (t) => {
      now = t;
      sim.tick(t);
    },
  };
}

export async function testApp(rt: Runtime) {
  return buildApp(rt, { corsOrigins: ['http://localhost:5173'], logger: false });
}
