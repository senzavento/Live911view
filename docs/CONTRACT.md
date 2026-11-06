# Contratto (server → web) — versione San Francisco, dati reali

Sorgente: DataSF dataset `gnap-fj3t` "Law Enforcement Dispatched Calls for Service: Real-Time"
(`https://data.sf.gov/resource/gnap-fj3t.json`, Socrata SODA, licenza PDDL, nessuna chiave obbligatoria, token opzionale `SOCRATA_APP_TOKEN` via header `X-App-Token`).
Metadati/ultimo aggiornamento: `https://data.sf.gov/api/views/gnap-fj3t.json` (`rowsUpdatedAt`, epoch s).

## Fatti verificati sui dati (2026-11-06)
- Finestra mobile di 48 h, aggiornata ogni 10 min **e ritardata di altri 10 min** (→ ritardo reale 10-20 min). Mai presentare come "istantaneo".
- ~3.700 righe nella finestra, ~690 senza `close_datetime` (aperte). Qualche riga molto vecchia già chiusa: filtrare per `received_datetime`.
- Solo polizia/sceriffo/MTA/HEART. Niente fuoco/EMS (dataset fuoco aggiornato 1 volta al giorno).
- ~31% `sensitive_call=true`: nessun `intersection_*`. **Non vanno mai mappate né esposte come Incident**: solo contate (`unlocated24h`). Non tentare di dedurre la posizione.
- Campi usati: `cad_number, received_datetime, dispatch_datetime, onscene_datetime, close_datetime, call_type_final(_desc) (fallback call_type_original(_desc)), priority_final (fallback priority_original: A/B/C), agency, onview_flag (Y/N), sensitive_call, intersection_id, intersection_name, intersection_point{coordinates:[lng,lat]}, analysis_neighborhood, call_last_updated_at, data_as_of, data_loaded_at`.
- **I timestamp NON hanno fuso**: sono ora locale di San Francisco (America/Los_Angeles, con DST). Convertire a UTC correttamente (test a cavallo del cambio ora). Esempio `2026-11-06T14:20:56.000` = 22:20:56Z.
- `onview_flag='Y'` = iniziata dall'agente; spesso i timestamp dispatch/enroute/onscene coincidono con received.
- `call_type_original_notes`/`call_type_final_notes` esistono: **non usarli né esporli** (possibili dati personali).
- Descrizioni delicate (suicidio, violenza domestica "DV", reati sessuali, salute mentale, persone scomparse, minori…): nell'`Incident.description` mostrare solo l'etichetta generica della categoria, non il testo della fonte (lista configurabile + test).

## Mappatura categorie (server)
`call_type_final_desc` → `IncidentType` con regole a parole chiave su una tabella dichiarativa + fallback `other`; ordine delle regole: violent > property > traffic > welfare > alarm > disturbance > proactive. Esempi: ASSAULT/BATTERY, ROBBERY, PERSON W/GUN|KNIFE, SHOTS, AGG ASSAULT → violent; BURGLARY, PETTY THEFT, VANDALISM, AUTO BOOST, STOLEN VEHICLE → property; VEH ACCIDENT, INJURY VEH ACCIDENT, TRAFFIC HAZARD, HIT AND RUN → traffic; WELL BEING CHECK, MENTALLY DISTURBED, MISSING, AIDED CASE, SUICIDE → welfare; AUDIBLE/SILENT ALARM → alarm; SUSPICIOUS PERSON/VEHICLE, FIGHT NO WEAPON, TRESPASSER, NOISE NUISANCE, THREATS, HOMELESS COMPLAINT, PROWLER → disturbance; TRAFFIC STOP, TRAF VIOLATION CITE/TOW, PASSING CALL, MEET W/…, STANDBY, PRISONER TRANSPORT, SIT/LIE ENFORCEMENT, TOW TRUCK → proactive.
Stato: `close_datetime` → resolved; altrimenti `onscene_datetime` valido (> received) → on_scene; altrimenti dispatched. Priorità A/B/C → 1/2/3 (altro → 3).

## API (base `http://localhost:8787`, in dev il web proxa `/api`)

| Endpoint | Risposta | Livello |
|---|---|---|
| `GET /api/health` | `{ ok, source: SourceStatus, uptimeSec }` (`ok=false` se l'ultimo poll è fallito da >15 min) | – |
| `GET /api/config` | `AppConfig` | – |
| `GET /api/summary` | `CitySummary` | 0 – San Francisco |
| `GET /api/areas` | `AreaInfo[]` | – |
| `GET /api/areas/:id` | `AreaDetail` (404 se ignoto) | 1 – quartiere |
| `GET /api/intersections/:id` | `IntersectionDetail` (404 se ignoto) | 2 – incrocio |
| `GET /api/incidents?type=&areaId=&intersectionId=&status=&limit=` | `Incident[]` (solo non risolti salvo `status=resolved`; limit default 500, max 2000) | 2/3 |
| `GET /api/incidents/:id` | `Incident` anche se risolto, finestra 48 h (404 se ignoto) | 3 – chiamata |
| `GET /api/stream` | SSE `StreamEvent`: primo `snapshot`, poi created/updated/resolved e `summary` ogni 5 s; heartbeat 15 s | live |

Tipi: `shared/src/types.ts`. Errori `{ error: string }`; parametri validati; mai stack trace.

## Sorgente (server)
`SfCadSource implements IncidentSource`: poll ogni `SF_POLL_SEC` (default 120, min 30): legge i metadati (`rowsUpdatedAt`) e scarica la finestra solo se cambiata; diff con lo store per generare created/updated/resolved; timeout, backoff esponenziale con jitter sugli errori, `User-Agent` identificativo, validazione runtime delle righe (scartare quelle malformate, mai crash), nessun dato non validato nel client. Gli errori sono esposti in `SourceStatus`. Il simulatore nazionale è RIMOSSO.

## Proprietà dei file (no conflitti tra agenti)

| Agente | Possiede |
|---|---|
| 1 Backend | `server/**` |
| 2 Mappa | `web/src/map/**` |
| 3 Pannelli | `web/src/panels/**`, `web/src/styles.css` |
| Orchestratore | `shared/**`, `web/src/store/**`, `web/src/main.ts`, `web/index.html`, config root, `docs/`, `deploy/`, `Dockerfile`, `compose.yaml`, `.github/**` |

Se serve cambiare un file non tuo, NON farlo: segnalalo nel report finale.

## Interfacce frontend
- `web/src/store/store.ts`: `Store` (stato live + SSE + selezione). `Selection = { areaId?, intersectionId?, incidentId? }`.
- `web/src/map/index.ts` esporta `mountMap(el, store, opts?): () => void`.
- `web/src/panels/index.ts` esporta `mountPanels(roots, store, opts?): () => void`.

## Livelli di zoom mappa (San Francisco, vista iniziale su `SF_BOUNDS`)
- zoom < 12.5: bolle per **quartiere** (raggio ∝ sqrt(attivi), colore = categoria dominante)
- 12.5 – 15: bolle per **incrocio** (aggregati per `intersectionId`)
- ≥ 15 (o incrocio selezionato): **singole chiamate** come puntini luminosi per categoria, pulsazione alla creazione; `proactive` più tenue
La selezione (`store.select(...)`) e la mappa si sincronizzano in entrambe le direzioni.

## Trasparenza in UI (obbligatoria)
Badge persistente "DATI REALI · ritardo ~10-20 min · fonte DataSF", orario `dataAsOf` e stato errore/obsoleto della sorgente; nota "N chiamate senza posizione (riservate) non mostrate sulla mappa"; solo polizia (non fuoco/EMS). Posizioni a livello di incrocio (già mascherate dalla fonte). Nessuna nota/testo libero delle chiamate.
