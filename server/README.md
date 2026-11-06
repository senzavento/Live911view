# @live911/server

Fastify API + SSE for Live911view, serving **real** San Francisco police dispatch data.
Contract and API: `docs/CONTRACT.md`; shared types: `shared/src/types.ts`.

## Data source

DataSF dataset `gnap-fj3t`, "Law Enforcement Dispatched Calls for Service: Real-Time" (Socrata SODA, PDDL license).

- Rolling 48 h window, refreshed upstream every ~10 min **and delayed another ~10 min**: the real delay is 10-20 min. Never "instant".
- Police, Sheriff, MTA and HEART calls only. No fire/EMS.
- About 30% of calls are `sensitive_call=true` and carry no location. About 1 in 100 more has no usable point.
- Timestamps are San Francisco wall-clock time without offset; `src/time.ts` converts them to UTC with `Intl` (DST aware, no dependencies). Ambiguous times (the repeated hour in November) resolve to the first occurrence, non-existent ones (March) shift forward.
- Positions are intersection level (already masked by the source). Many "open" calls are MTA parking citations that never get a `close_datetime`; they stay active for the whole window. `avgDispatchSec` is therefore large (tens of minutes): it is what the data says.

## Run

```bash
npm run dev -w server          # tsx watch, http://localhost:8787
npm run start -w server
npm run build -w server        # tsc + esbuild bundle -> dist/index.mjs
npm run start:prod -w server
npm run test -w server
npm run typecheck -w server
```

Behind an outbound HTTP proxy, Node's `fetch` ignores `HTTPS_PROXY` unless started with `NODE_USE_ENV_PROXY=1` (Node >= 22.21).

## Environment

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | listen port |
| `HOST` | `0.0.0.0` | listen address |
| `SF_POLL_SEC` | `120` | poll period, 30-3600 s. The metadata (`rowsUpdatedAt`) is checked each poll; the window is downloaded only when it changed (and at least every 10 polls) |
| `SOCRATA_APP_TOKEN` | unset | optional, sent as `X-App-Token` (lifts the anonymous rate limit). Never logged or returned |
| `CORS_ORIGIN` | `http://localhost:5173` | allowed origin(s), comma-separated |
| `LOG_LEVEL` | `info` | Fastify/pino level |
| `STATIC_DIR` | unset | built web app to serve at `/` |
| `BASEMAP_TILES` | unset | optional raster basemap, https XYZ template with `{z}/{x}/{y}` (may contain an API key: keep it in env, never in the repo/image) |
| `BASEMAP_ATTRIBUTION` | `© OpenStreetMap contributors` | plain-text attribution required by your tile provider |
| `BASEMAP_TILE_SIZE` | `256` | `256` or `512` |
| `BASEMAP_MAX_ZOOM` | `18` | max zoom of the tiles |

`/api/health` is `ok=false` until the first successful poll and again when the last success is older than 15 min.

## Layout

- `src/source.ts` - `IncidentSource` interface and `SourceWindow`
- `src/sources/sfcad.ts` - `SfCadSource`: metadata check, paginated window download, timeout, exponential backoff with jitter, safe error messages
- `src/sources/row.ts` - row-by-row runtime validation (type guards, invalid rows dropped and counted)
- `src/sources/mapping.ts` - call type -> `IncidentType` (declarative regex table), priority, status
- `src/sources/sensitive.ts` - call types whose text is replaced by the category label
- `src/store.ts` - the 48 h window (active + resolved) and the diff that yields created/updated/resolved
- `src/analytics.ts` - city/area/intersection views computed from the window, cached per store version and 2 s
- `src/stream.ts` - SSE hub (250 ms batching, backpressure, heartbeat 15 s, `summary` every 5 s)
- `src/app.ts`, `src/validation.ts`, `src/config.ts`, `src/runtime.ts`, `src/index.ts`

Semantics worth knowing:

- `active` = unresolved calls with a location. `last24h` = every call received in the last 24 h, unlocated included; for areas and intersections it counts located calls only, so `sum(byArea.last24h) + unlocated24h == last24h`.
- Timeline: 24 UTC-hour buckets (the last one is the current, partial hour), located calls only (`total == sum(byType)`); it can differ slightly from `last24h`.
- `ratePerHour`: calls received in the last 60 min, unlocated included.
- `avgDispatchSec`: located, not officer-initiated calls received in the last 24 h with a dispatch time; `null` below 10 samples.
- Areas keep a stable slug id (`Mission` -> `mission`, missing -> `unknown`/"Sconosciuto"); their centroid is the mean of observed positions. Areas are never forgotten once seen.
- A call the source stops listing while still inside the requested range is closed (`incident.resolved`) and removed. An empty response never triggers this.

## Privacy

- `sensitive_call=true`, a missing `sensitive_call`, or a missing/out-of-city `intersection_point` -> the call is never an `Incident`. Only its id and reception time are kept (to count it in `unlocated24h` / `last24h`); nothing else is read from the row.
- The `*_notes` columns are never requested (`$select` lists the columns used) nor read.
- For delicate categories (self-harm, DV, sexual offences, mental health, missing persons, minors, stalking) `Incident.description` is the generic label of the category (`TYPE_META[type].label`), not the source text. The list is `SENSITIVE_DESCRIPTION_PATTERNS` in `src/sources/sensitive.ts`.
- Nothing unvalidated reaches the client: ids, strings (length/control characters) and coordinates (city bounding box) are checked per row.
- Errors in `SourceStatus.lastError` are one of `HTTP <status>`, `timeout`, `network error`, `invalid response`, `invalid data`, `too many rows`: no URLs, tokens or bodies.

## Adding another source

Implement `IncidentSource` (`subscribe`, `start`, `stop`, `status`, `lastSuccessAt`) and emit a validated `SourceWindow` (`incidents` with location, `unlocated` ids/times, `windowStartMs`) whenever you have a fresh view of your window. The store derives created/updated/resolved by diffing, so the source does not track changes. Reuse `parseRow`-style type guards, keep delicate text out of `description`, then pass it in:

```ts
createRuntime({ source: new MyCadSource() });
```

For tests use `FakeSource` and `testRuntime` from `src/testing.ts`.

## Known limits

- In-memory only: a restart reloads the 48 h window from DataSF (one request, a few MB).
- Pagination uses `$offset`; a row changing between pages could be missed until the next poll.
- Only calls received in the last 48 h are fetched; an older call still open upstream is not shown.
