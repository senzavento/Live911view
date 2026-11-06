import cors from '@fastify/cors';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Runtime } from './runtime';
import { parseIncidentQuery } from './validation';

export interface AppOptions {
  corsOrigins: string[];
  logger: FastifyServerOptions['logger'];
}

export async function buildApp(rt: Runtime, opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger, forceCloseConnections: true, maxParamLength: 100 });

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

  registerRoutes(app, rt);
  return app;
}

function registerRoutes(app: FastifyInstance, rt: Runtime): void {
  app.get('/api/health', async () => ({
    ok: true,
    simulated: true,
    uptimeSec: Math.floor((rt.clock() - rt.startedAt) / 1000),
  }));

  app.get('/api/summary', async () => rt.aggregator.nationalSummary());

  app.get<{ Params: { code: string } }>('/api/states/:code', async (req, reply) => {
    const detail = rt.aggregator.stateDetail(req.params.code.toUpperCase());
    return detail ?? reply.code(404).send({ error: 'Unknown state' });
  });

  app.get('/api/cities', async () => rt.cities);

  app.get<{ Params: { id: string } }>('/api/cities/:id', async (req, reply) => {
    const summary = rt.aggregator.citySummary(req.params.id);
    return summary ?? reply.code(404).send({ error: 'Unknown city' });
  });

  app.get('/api/incidents', async (req, reply) => {
    const parsed = parseIncidentQuery(req.query);
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error });
    return rt.store.query(parsed.value.filter, parsed.value.limit);
  });

  app.get<{ Params: { id: string } }>('/api/incidents/:id', async (req, reply) => {
    const incident = rt.store.get(req.params.id);
    return incident ?? reply.code(404).send({ error: 'Unknown incident' });
  });

  app.get('/api/stream', (req, reply) => {
    if (rt.hub.isFull) return reply.code(503).send({ error: 'Too many open streams' });
    reply.hijack();
    rt.hub.attach(req.raw, reply.raw, reply.getHeaders());
  });
}
