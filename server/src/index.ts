import { buildApp } from './app';
import { loadConfig } from './config';
import { createRuntime } from './runtime';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const config = loadConfig();
  let onError: (err: unknown) => void = (err) => console.error(err);
  const runtime = createRuntime({ seed: config.simSeed, rate: config.simRate, onError: (e) => onError(e) });
  const app = await buildApp(runtime, { corsOrigins: config.corsOrigins, logger: { level: config.logLevel } });
  onError = (err) => app.log.error(err);

  runtime.start();
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`simulated data (seed ${config.simSeed}, ~${config.simRate} new/s), ${runtime.store.activeCount} active`);

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    app.log.info(`${signal} received, shutting down`);
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error(err);
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
