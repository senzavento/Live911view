# @live911/server

Fastify API + SSE for Live911view. Data is **synthetic**: a simulator generates 911-style incidents for ~120 US cities (no real data, no PII).

## Run

```bash
npm run dev -w server      # tsx watch, http://localhost:8787
npm run start -w server
npm run test -w server
npm run typecheck -w server
```

API: see `docs/CONTRACT.md`.

## Environment

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | listen port |
| `HOST` | `0.0.0.0` | listen address |
| `SIM_RATE` | `16` | mean national new incidents per second (about 4-5k active at the default; active scales linearly) |
| `SIM_SEED` | time-based | RNG seed; same seed + same virtual clock = same incidents |
| `CORS_ORIGIN` | `http://localhost:5173` | allowed origin(s), comma-separated |
| `LOG_LEVEL` | `info` | Fastify/pino level |

## Layout

- `src/source.ts` - `IncidentSource` interface and `SourceEvent`
- `src/sim/` - simulator (Poisson arrivals by population and local time of day, lifecycle, geo scatter)
- `src/store.ts` - active incidents + bounded ring of resolved ones
- `src/aggregate.ts`, `src/minuteRing.ts` - incremental counters, 24h per-minute rings
- `src/stream.ts` - SSE hub (250 ms batching, backpressure, heartbeat)
- `src/app.ts`, `src/validation.ts` - routes and strict input validation

Simulated durations are compressed (incidents last minutes, not hours) so the stated rate gives a few thousand concurrent incidents.

## Using a real data source

Implement `IncidentSource` (`subscribe`, `start`, `stop`) and emit `created` / `updated` / `resolved` events with full `Incident` objects (cities must come from `data/cities.ts` or be passed to `createRuntime`). Optionally emit `history` batches at start to fill the 24h totals. Then pass it in:

```ts
createRuntime({ seed: 0, rate: 0, source: new MyCadSource() });
```

Store, aggregates, SSE and API need no changes.
