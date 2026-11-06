# Live 911 View

Dashboard live degli interventi 911 negli USA con drill-down a 4 livelli:
**Nazionale → Stato → Città → Singolo incidente**. La mappa passa da bolle aggregate per stato, a bolle per città, a puntini luminosi per tipologia in base allo zoom, in sincronia con i pannelli.

> **I dati sono SINTETICI.** Non esiste un feed 911 nazionale pubblico in tempo reale; il server usa un simulatore (nessun dato reale, nessuna PII). L'UI lo dichiara con il badge "DATI SIMULATI". Una sorgente reale (es. open data di singole città) si collega implementando `IncidentSource` (vedi `server/README.md`).

## Avvio

```bash
npm install
npm run dev        # server :8787 + web :5173
npm test           # server + web
npm run typecheck
```

## Struttura

- `shared/` tipi e tema condivisi (contratto dati)
- `server/` Fastify: simulatore, aggregazioni, API REST + SSE (`docs/CONTRACT.md`)
- `web/` Vite + TypeScript + MapLibre GL: `src/map/` (mappa), `src/panels/` (pannelli), `src/store/` (stato live)

## Note

- La basemap usa tile CARTO pubblici (nessuna API key); se non raggiungibili la mappa resta utilizzabile su sfondo scuro.
- Le durate degli incidenti simulati sono compresse (minuti), quindi il "tempo medio di invio" (~90 s) non è un dato realistico.
