# Installazione su Raspberry Pi

Modalità: **un solo processo** Node (Fastify) che serve API, stream SSE e il frontend compilato sulla porta `8787`, gestito da systemd. Pensata per **uso in rete locale**.

> L'app non ha autenticazione né rate limit: **non esporla a Internet** (niente port forwarding). Per l'accesso remoto usa una VPN (es. Tailscale/WireGuard) oppure metti davanti un reverse proxy con HTTPS e autenticazione.

## Requisiti
- Raspberry Pi 3/4/5 o Zero 2 W con **OS 64 bit** (Raspberry Pi OS Lite va bene). Pi Zero/1 (ARMv6) non sono supportati da Node 20+.
- Node.js **20 o superiore** (consigliato 22 LTS), git, almeno ~1 GB di RAM per la build.
- Connessione a Internet sul Pi (installazione dipendenze). Il **browser** che apre la dashboard deve raggiungere i tile della mappa (CARTO/OpenStreetMap).

## Passi

```bash
# 1. Node 22 (se non presente), via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

# 2. Codice in /opt (non sotto /home: il servizio è isolato)
sudo mkdir -p /opt/live911view && sudo chown "$USER" /opt/live911view
git clone -b claude/911-dashboard-monitoring-2uk0jr https://github.com/senzavento/Live911view.git /opt/live911view

# 3. Build + installazione servizio
cd /opt/live911view && ./deploy/install.sh
```

Lo script installa le dipendenze, compila, crea `/etc/systemd/system/live911view.service`, lo abilita all'avvio e stampa l'URL: `http://<ip-del-pi>:8787`.

## Configurazione
Variabili in `/etc/live911view.env` (una `CHIAVE=valore` per riga), poi `sudo systemctl restart live911view`:

| Var | Default Pi | Significato |
|---|---|---|
| `PORT` | 8787 | porta |
| `SIM_RATE` | 8 | nuovi incidenti/s a livello nazionale (~2-3k attivi); 16 = ~5k attivi |
| `LOG_LEVEL` | info | livello log |

## Gestione
```bash
systemctl status live911view
journalctl -u live911view -f
sudo systemctl restart live911view
# aggiornamento
cd /opt/live911view && git pull && ./deploy/install.sh
```

## Se la build è troppo lenta/pesante sul Pi
Compila su un altro computer (`npm ci && npm run build`) e copia sul Pi `web/dist/` e `server/dist/`, poi esegui `npm ci --omit=dev` sul Pi e adatta l'unit systemd.

## Note di sicurezza
Il servizio gira come utente effimero (`DynamicUser`), con filesystem in sola lettura, senza privilegi aggiuntivi e con limite di memoria (400 MB).

---

# Variante Docker (alternativa a systemd)

Richiede Docker con il plugin Compose sul Pi (OS 64 bit consigliato).

```bash
# Installa Docker (una tantum) e dai il permesso al tuo utente
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # poi disconnettiti e riconnettiti

# Codice e avvio
git clone -b claude/911-dashboard-monitoring-2uk0jr https://github.com/senzavento/Live911view.git
cd Live911view
docker compose up -d --build     # la prima build sul Pi richiede alcuni minuti
```

Apri `http://<ip-del-pi>:8787` (o l'IP Tailscale `100.x.y.z`).

```bash
docker compose logs -f           # log
docker compose ps                # stato (include l'healthcheck)
docker compose down              # stop
git pull && docker compose up -d --build   # aggiornamento
```

Configurazione: modifica `environment` in `compose.yaml` (`SIM_RATE`, `LOG_LEVEL`). Per esporre la porta solo sull'indirizzo Tailscale cambia `ports` in `"100.x.y.z:8787:8787"`.

Il container gira come utente non root, con filesystem in sola lettura, tutte le capability rimosse e limite di memoria di 400 MB. Non esporlo a Internet (nessuna autenticazione).

> La build del Dockerfile non è stata provata nella sandbox (nessun demone Docker disponibile): ne ho verificato i singoli passi (dipendenze di produzione e avvio del bundle). Se `docker compose up` dà errori, incollali.
