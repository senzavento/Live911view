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
