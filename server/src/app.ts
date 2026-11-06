import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { AppConfig, BasemapConfig } from '@live911/shared';
import type { Runtime } from './runtime';
import { AREA_ID, INCIDENT_ID, INTERSECTION_ID, parseIncidentQuery } from './validation';

export interface AppOptions {
  corsOrigins: string[];
  logger: FastifyServerOptions['logger'];
  /** Directory of the built web app; when set it is served at `/` (single-port deployment). */
  staticDir?: string;
  /** Optional basemap handed to the web client via GET /api/config. */
  basemap?: BasemapConfig | null;
}

export async function buildApp(rt: Runtime, opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger, forceCloseConnections: true, routerOptions: { maxParamLength: 100 } });

  await app.register(cors, { origin: opts.corsOrigins, methods: ['GET', 'HEAD', 'OPTIONS'] });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    if (req.url.startsWith('/api/') && !reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'no-store');
    return payload;
  });
  app.addHook('onClose', async () => rt.stop());

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'Not found' }));
  app.setErrorHandler((error: FastifyError, req, reply) => {
    const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    if (status === 500) req.log.error(error);
    // Internal details never leave the process.
    reply.code(status).send({ error: status === 500 ? 'Internal server error' : error.message });
  });

  registerRoutes(app, rt, { basemap: opts.basemap ?? null });
  if (opts.staticDir) {
    // Registered after the API routes; unknown /api/* paths still hit the JSON 404 handler.
    await app.register(fastifyStatic, { root: opts.staticDir, wildcard: true, index: 'index.html' });
  }
  return app;
}

function registerRoutes(app: FastifyInstance, rt: Runtime, config: AppConfig): void {
  app.get('/api/config', async () => config);

  app.get('/api/health', async () => ({
    ok: rt.isHealthy(),
    source: rt.source.status(),
    uptimeSec: Math.floor((rt.clock() - rt.startedAt) / 1000),
  }));

  app.get('/api/summary', async () => rt.analytics.citySummary());

  app.get('/api/areas', async () => rt.analytics.areas());

  app.get<{ Params: { id: string } }>('/api/areas/:id', async (req, reply) => {
    if (!AREA_ID.test(req.params.id)) return reply.code(400).send({ error: 'id is malformed' });
    return rt.analytics.areaDetail(req.params.id) ?? reply.code(404).send({ error: 'Unknown area' });
  });

  app.get<{ Params: { id: string } }>('/api/intersections/:id', async (req, reply) => {
    if (!INTERSECTION_ID.test(req.params.id)) return reply.code(400).send({ error: 'id is malformed' });
    return rt.analytics.intersectionDetail(req.params.id) ?? reply.code(404).send({ error: 'Unknown intersection' });
  });

  app.get('/api/incidents', async (req, reply) => {
    const parsed = parseIncidentQuery(req.query);
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error });
    return rt.store.query(parsed.value.filter, parsed.value.limit);
  });

  app.get<{ Params: { id: string } }>('/api/incidents/:id', async (req, reply) => {
    if (!INCIDENT_ID.test(req.params.id)) return reply.code(400).send({ error: 'id is malformed' });
    return rt.store.get(req.params.id) ?? reply.code(404).send({ error: 'Unknown incident' });
  });

  app.get('/api/stream', (req, reply) => {
    if (rt.hub.isFull) return reply.code(503).send({ error: 'Too many open streams' });
    reply.hijack();
    rt.hub.attach(req.raw, reply.raw, reply.getHeaders());
  });
}
