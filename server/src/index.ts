import { existsSync } from 'node:fs';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createRuntime } from './runtime';
import { SfCadSource, type SfCadLogger } from './sources/sfcad';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const config = loadConfig();
  const staticDir = config.staticDir;
  if (staticDir && !existsSync(staticDir)) throw new Error(`STATIC_DIR does not exist: ${staticDir} (run "npm run build")`);

  // The logger exists only once the app is built; the source and runtime log through this indirection.
  let log: SfCadLogger = { info: () => undefined, warn: (obj, msg) => console.warn(msg, obj) };
  const source = new SfCadSource({
    pollSec: config.pollSec,
    appToken: config.socrataAppToken,
    log: { info: (o, m) => log.info(o, m), warn: (o, m) => log.warn(o, m) },
  });
  const runtime = createRuntime({ source, activeWindowMin: config.activeWindowMin, onError: (err) => log.warn({ err }, 'runtime error') });
  const app = await buildApp(runtime, { corsOrigins: config.corsOrigins, logger: { level: config.logLevel }, staticDir, basemap: config.basemap });
  log = { info: (o, m) => app.log.info(o, m), warn: (o, m) => app.log.warn(o, m) };

  runtime.start();
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`polling DataSF every ${config.pollSec}s`);

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
