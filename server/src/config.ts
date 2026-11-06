export interface Config {
  port: number;
  host: string;
  simRate: number;
  simSeed: number;
  corsOrigins: string[];
  logLevel: string;
}

type Env = Record<string, string | undefined>;

function number(env: Env, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${key} must be a number between ${min} and ${max}, got "${raw}"`);
  }
  return n;
}

export function loadConfig(env: Env = process.env): Config {
  return {
    port: Math.trunc(number(env, 'PORT', 8787, 0, 65535)),
    host: env.HOST || '0.0.0.0',
    // mean national new incidents/s; the default settles at roughly 4-5k active
    simRate: number(env, 'SIM_RATE', 16, 0.1, 500),
    simSeed: Math.trunc(number(env, 'SIM_SEED', Date.now() % 2 ** 31, 0, 2 ** 32 - 1)),
    corsOrigins: (env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
    logLevel: env.LOG_LEVEL || 'info',
  };
}
