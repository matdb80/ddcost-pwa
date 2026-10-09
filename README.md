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

## Pubblicazione online (Deploy)

### Opzione consigliata: Railway.app

Per un'app fullstack con backend Node.js + MySQL, **Railway** e' la scelta piu' semplice.

#### Passo 1 — Push su GitHub

```bash
# 1. Crea un nuovo repository vuoto su GitHub (senza README, .gitignore o licenza)
#    Esempio: https://github.com/TUOUSERNAME/ddcost-pwa

# 2. Aggiungi il remote e pusha
git remote add origin https://github.com/TUOUSERNAME/ddcost-pwa.git
git branch -M main
git push -u origin main
```

#### Passo 2 — Deploy su Railway

1. Vai su [railway.app](https://railway.app) e registrati con GitHub
2. Clicca **"New Project"** → **"Deploy from GitHub repo"**
3. Seleziona il repository `ddcost-pwa`
4. Railway rileva automaticamente il `package.json` e configura:
   - **Build**: `npm run build`
   - **Start**: `npm start`
5. Vai nella sezione **Variables** e aggiungi tutte le variabili dal tuo file `.env`:
   - `DATABASE_URL`
   - `APP_ID`
   - `APP_SECRET`
   - `VITE_KIMI_AUTH_URL`
   - `VITE_APP_ID`
   - `KIMI_AUTH_URL`
   - `KIMI_OPEN_URL`
   - `OWNER_UNION_ID`
6. Clicca **Deploy**
7. Una volta deployato, copia l'URL generato (es. `https://ddcost-production.up.railway.app`)

#### Passo 3 — Aggiorna OAuth

1. Vai nel portale Kimi dove hai registrato l'applicazione
2. Aggiorna la **Callback URL**:
   ```
   https://TUO-URL-RAILWAY.app/api/oauth/callback
   ```
3. Aggiorna anche `VITE_REDIRECT_URI` e `VITE_KIMI_AUTH_URL` nelle variabili Railway se necessario

---

### Perche' non Vercel?

Vercel e' ottimo per **frontend statici** (React, Next.js, ecc.). Il tuo DDCost pero' e' un'app **fullstack** con:
- Server backend Node.js (Hono)
- API tRPC
- Database MySQL con connessioni persistenti

Su Vercel questo richiede di riscrivere il backend come "Serverless Functions", con molte modifiche al codice. Railway invece esegue direttamente il tuo server Node.js senza modifiche.

---

## Migrazione dati da DDCost desktop

Per importare i dati storici dai database SQLite alla versione PWA:

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

Il percorso deve contenere i file:
- `preventivi_unatantum.sqlite`
- `costi_standard.sqlite`
- `simulazioni_cicli.sqlite`
- `offerte_commerciali.sqlite`

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

Copia `.env.example` in `.env` e compila tutti i valori. **Non committare mai il file `.env`** (e' gia' in `.gitignore`).

## Note

- Le immagini per le Bandelle a T vanno copiate in `public/images/`
- I file Excel per le Bandelle Veneta vanno messi in `data/` (gestione futura)
