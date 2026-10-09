# DDCost PWA v2.0

Versione web di DDCost (Preventivatore Speciali) con database centralizzato MySQL.

## Caratteristiche

- **Autenticazione OAuth 2.0** — login sicuro con Kimi
- **Database MySQL** — dati sincronizzati su cloud, niente più conflitti OneDrive
- **Responsive** — funziona su PC, tablet e smartphone
- **Aggiornamenti automatici** — niente più installazione manuale

## Stack tecnico

- Frontend: React 19 + TypeScript + Tailwind CSS + shadcn/ui
- Backend: Hono + tRPC + Drizzle ORM
- Database: MySQL
- Auth: OAuth 2.0 (Kimi)

## Schermate disponibili

| Route | Descrizione |
|---|---|
| `/` | Home / Dashboard |
| `/cicli` | Cicli Standard e prezzi minimi |
| `/bandelle-t` | Bandelle a T |
| `/bandelle-veneta` | Bandelle per scuri alla veneta |
| `/preventivi` | Preventivi Unatantum |
| `/offerte` | Offerte Commerciali |

---

## Pubblicazione online — Fly.io (consigliato)

**Perche' Fly.io:**
- Piano gratuito reale (3 VM sempre attive, nessun "sleep")
- Zero cold start (il server e' sempre acceso)
- Node.js nativo, nessuna modifica al codice

### Passo 1 — Push su GitHub

```bash
# 1. Crea un repository vuoto su GitHub (senza README, .gitignore o licenza)
#    https://github.com/new → Nome: ddcost-pwa

# 2. Nella cartella del progetto
git remote add origin https://github.com/TUOUSERNAME/ddcost-pwa.git
git branch -M main
git push -u origin main
```

### Passo 2 — Installa Fly CLI

```bash
# macOS/Linux
curl -L https://fly.io/install.sh | sh

# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex
```

### Passo 3 — Registrati e crea l'app

```bash
# Login (apre il browser)
fly auth login

# Crea l'app (scegli la regione 'Frankfurt, Germany (fra)' per l'Italia)
fly apps create ddcost-pwa
```

### Passo 4 — Imposta le variabili d'ambiente

Copia TUTTE le variabili dal tuo file `.env`:

```bash
fly secrets set DATABASE_URL="mysql://..."
fly secrets set APP_ID="il-tuo-app-id"
fly secrets set APP_SECRET="il-tuo-app-secret"
fly secrets set VITE_KIMI_AUTH_URL="https://..."
fly secrets set VITE_APP_ID="il-tuo-app-id"
fly secrets set KIMI_AUTH_URL="https://..."
fly secrets set KIMI_OPEN_URL="https://..."
fly secrets set OWNER_UNION_ID="il-tuo-union-id"
```

### Passo 5 — Deploy

```bash
fly deploy
```

Fly.io builda l'immagine Docker e deploya. Al termine ti mostra l'URL:
```
https://ddcost-pwa.fly.dev
```

### Passo 6 — Aggiorna OAuth

Vai nel portale Kimi e aggiorna la **Callback URL**:
```
https://ddcost-pwa.fly.dev/api/oauth/callback
```

### Aggiornamenti futuri

Ogni volta che modifichi il codice:
```bash
git add .
git commit -m "descrizione cambiamento"
git push origin main
fly deploy
```

---

## Migrazione dati da DDCost desktop

Per importare i dati storici dai database SQLite:

```bash
# Unisci database da 2 PC (se necessario)
npx tsx scripts/merge-sqlite.ts <pc1_dir> <pc2_dir> <output_dir>

# Importa nel database MySQL
npx tsx scripts/import-merged-sqlite.ts <cartella_merge>
```

Esempio:
```bash
npx tsx scripts/import-merged-sqlite.ts /mnt/agents/output/merge_unified
```

---

## Sviluppo locale

```bash
npm install
npm run db:push    # sincronizza schema DB
npm run dev        # avvia server sviluppo su http://localhost:3000
```

## Build produzione

```bash
npm run build      # build frontend + backend
npm start          # avvia server produzione
```

## Variabili d'ambiente

Copia `.env.example` in `.env` e compila tutti i valori. **Non committare mai il file `.env`**.

## Note

- Le immagini per le Bandelle a T vanno copiate in `public/images/`
- I file Excel per le Bandelle Veneta vanno messi in `data/` (gestione futura)
