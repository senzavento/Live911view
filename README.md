# Live 911 View — San Francisco

Dashboard live delle chiamate dispatchate a San Francisco, con drill-down a 4 livelli:
**San Francisco → Quartiere → Incrocio → Chiamata**. La mappa passa da bolle per quartiere, a bolle per incrocio, a puntini luminosi per categoria in base allo zoom, in sincronia con i pannelli.

## Dati: reali, ma con limiti
Fonte: [DataSF – Law Enforcement Dispatched Calls for Service: Real-Time](https://data.sf.gov/d/gnap-fj3t) (licenza PDDL).
- **Ritardo 10-20 minuti**: la fonte si aggiorna ogni 10 min e ha altri 10 min di ritardo.
- **Solo polizia, sceriffo, MTA e HEART.** Niente fuoco né soccorso medico (quel dataset si aggiorna una volta al giorno).
- **~31% delle chiamate è "sensibile" e non ha posizione**: viene contata ma mai mostrata sulla mappa, e non si tenta di dedurla. Le note libere non sono usate; le categorie delicate (suicidio, violenza domestica, salute mentale…) mostrano solo l'etichetta generica.
- **"In corso" è una stima**: la fonte spesso non registra la chiusura, quindi una chiamata senza aggiornamenti da più di 2 ore (30 min per multe e fermi) è considerata scaduta. Vedi `docs/CONTRACT.md`.
- Posizioni a livello di incrocio, già mascherate dalla fonte.

## Avvio

```bash
npm install
npm run dev        # server :8787 + web :5173
npm test           # server + web
npm run typecheck
```

## Struttura
- `shared/` tipi e tema condivisi (contratto dati)
- `server/` Fastify: sorgente DataSF (polling), store 48 h, aggregazioni, API REST + SSE (`docs/CONTRACT.md`, `server/README.md`)
- `web/` Vite + TypeScript + MapLibre GL: `src/map/`, `src/panels/`, `src/store/`

## Deploy
Raspberry Pi con Docker o systemd: `docs/DEPLOY-RASPBERRY.md`. Immagine multi-arch su GHCR costruita da GitHub Actions. La basemap è opzionale e si configura a runtime con una tua chiave (`BASEMAP_TILES`), mai nel repo né nell'immagine.
