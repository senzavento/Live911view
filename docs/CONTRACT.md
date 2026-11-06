# Contratto API (server → web)

Base: `http://localhost:8787` (in dev il web proxa `/api`).
Tipi: `shared/src/types.ts`. **Dati sintetici** generati da un simulatore (non esiste un feed 911 nazionale pubblico).

| Endpoint | Risposta | Livello |
|---|---|---|
| `GET /api/health` | `{ ok: true, simulated: true, uptimeSec }` | – |
| `GET /api/summary` | `NationalSummary` | 0 – nazionale |
| `GET /api/states/:code` | `StateDetail` (404 se ignoto) | 1 – stato |
| `GET /api/cities` | `City[]` | – |
| `GET /api/cities/:id` | `CitySummary` (404 se ignota) | 2 – città |
| `GET /api/incidents?type=&state=&cityId=&status=&limit=` | `Incident[]` (solo non risolti salvo `status=resolved`; limit default 500, max 2000) | 2/3 |
| `GET /api/incidents/:id` | `Incident` (404 se ignoto) | 3 – singolo |
| `GET /api/stream` | SSE, eventi `StreamEvent`; primo evento `snapshot`, poi created/updated/resolved e `summary` ogni 2 s; heartbeat commento ogni 15 s | live |

Errori: `{ error: string }` con status HTTP appropriato. Parametri validati (type ∈ INCIDENT_TYPES, state = 2 lettere, ecc.).

# Proprietà dei file (no conflitti tra agenti)

| Agente | Possiede |
|---|---|
| 1 Backend | `server/**` |
| 2 Mappa | `web/src/map/**` |
| 3 Pannelli | `web/src/panels/**`, `web/src/styles.css` |
| Orchestratore | `shared/**`, `web/src/store/**`, `web/src/main.ts`, `web/index.html`, config root |

Se serve cambiare un file non tuo, NON farlo: segnalalo nel report finale.

# Interfacce frontend

- `web/src/store/store.ts`: `Store` (stato live + SSE + selezione drill-down). Vedi file.
- `web/src/map/index.ts` esporta `mountMap(el: HTMLElement, store: Store): () => void`.
- `web/src/panels/index.ts` esporta `mountPanels(root: { header, sidebar, detail, legend: HTMLElement }, store: Store): () => void`.

## Livelli di zoom mappa (Agente 2)
- zoom < 4.5: bolle aggregate per **stato** (dimensione ∝ attivi, colore = tipo dominante)
- 4.5–8: aggregati per **città** (bolle con ring per tipo)
- ≥ 8 (o città selezionata): **singoli incidenti** come puntini luminosi colorati per tipo, pulsazione alla creazione
La selezione (`store.select(...)`) e la mappa si sincronizzano in entrambe le direzioni.
