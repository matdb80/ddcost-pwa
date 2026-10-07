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

## Migrazione dati da DDCost desktop

Per importare i dati storici dai database SQLite alla versione PWA:

```bash
npx tsx scripts/import-sqlite.ts <percorso_cartella_DDCost>
```

Esempio:
```bash
npx tsx scripts/import-sqlite.ts "C:/Users/Mario/Documents/DDCost"
```

Il percorso deve contenere i file:
- `preventivi_unatantum.sqlite`
- `costi_standard.sqlite`
- `simulazioni_cicli.sqlite`
- `offerte_commerciali.sqlite`

## Sviluppo

```bash
npm install
npm run db:push    # sincronizza schema DB
npm run dev        # avvia server sviluppo
```

## Build produzione

```bash
npm run build
npm start
```

## Note

- Le immagini per le Bandelle a T vanno copiate in `public/images/`
- I file Excel per le Bandelle Veneta vanno messi in `data/` (gestione futura)
