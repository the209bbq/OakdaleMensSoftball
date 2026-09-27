# Oakdale Men's Softball

Website for the Oakdale Men's Softball League — league standings, the season schedule, and team rosters.

It's a small full-stack TypeScript app:

- **`server/`** — Express + TypeScript REST API with a SQLite-backed data store (`better-sqlite3`). Computes standings from recorded game results.
- **`client/`** — React + Vite + TypeScript single-page app with Standings, Schedule, and Rosters views (including an "add a player" form).

## Prerequisites

- Node.js >= 20 (developed against Node 22)
- npm (uses npm workspaces)

## Getting started

```bash
npm install        # install all workspace dependencies
npm run dev         # run API (:3001) and web client (:5173) together
```

Then open http://localhost:5173. The Vite dev server proxies `/api/*` to the API on port 3001.

## Common scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run server + client dev servers concurrently |
| `npm run dev:server` | Run only the API (`:3001`) |
| `npm run dev:client` | Run only the web client (`:5173`) |
| `npm run build` | Type-check and build both packages for production |
| `npm start` | Serve the built client from the API (`:3001`) after `npm run build` |
| `npm test` | Run server (Vitest + Supertest) and client (Vitest + Testing Library) tests |
| `npm run lint` | Lint the whole repo with ESLint |

## API overview

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/teams` | List teams |
| GET | `/api/standings` | League standings, computed from played games |
| GET | `/api/schedule` | Full season schedule with team names |
| GET | `/api/teams/:id/roster` | A team and its roster |
| POST | `/api/players` | Add a player (`teamId`, `name`, `number`, `position`) |
| POST | `/api/games/:id/result` | Record a game result (`homeScore`, `awayScore`) |
| GET | `/api/admin/player-stats-sheet` | Admin: Google Sheet sync status (spreadsheet ID is persisted) |
| POST | `/api/admin/player-stats-sheet/sync` | Admin: write player stats, or `{ "dryRun": true }` for the payload |
| GET | `/api/admin/player-stats-sheet.csv` | Admin: team-categorized batting CSV (same layout as the sheet) |

## Google Sheet (player stats)

David's workbook is [Softball Stats](https://docs.google.com/spreadsheets/d/1LwMlsDCZBEqCQqb2qW0lhpTlWNNa-OpcGOPQnbqj1wc/edit). When we inspected it, it had a single empty `Sheet1` tab (cell A1 was `1`) and no team or player rows yet. The app writes a dedicated **Player Stats** tab only — schedule/standings/`Sheet1` are left alone.

Layout (one section per team with **15 roster spots**, then Free Agents if anyone is unattached):

`Player | # | Pos | GP | Hits | AB | AVG | 1B | 2B | 3B | HR | K | Out`

On the Admin tab: **Update Google Sheet**, **Preview rows**, and **Download CSV**. After a game result is saved, the server also tries a background push when credentials exist.

### Auth David still needs

The site boots without Google credentials. To write the live sheet:

1. In Google Cloud, enable the **Google Sheets API**.
2. Create a **service account** and download its JSON key.
3. Share the spreadsheet with that `client_email` as **Editor**.
4. Set `SPREADSHEET_ID=1LwMlsDCZBEqCQqb2qW0lhpTlWNNa-OpcGOPQnbqj1wc` and either `GOOGLE_SERVICE_ACCOUNT_JSON` (the JSON string) or `GOOGLE_SHEETS_CREDENTIALS` (path to the JSON file).

Do not commit the key. Until those secrets exist, use **Preview rows** or **Download CSV** and paste into the Player Stats tab.

## Data

Seed data lives in `server/src/seed.ts`. At runtime the API persists to `data/league.db` (git-ignored), so changes made through the app survive restarts. A leftover `data/league.json` is imported once on first boot.

## Deploy (self-host, including free)

Production is a single Node process that serves the built client and stores data in SQLite. Copy `.env.example` to `.env`, set a strong `ADMIN_PASSWORD` and `SESSION_SECRET`, and keep `SEED_DEMO_USERS=false`.

**Free and cheap options** (Oracle Always Free VM, Cloudflare Tunnel, Fly.io, Render) with copy-paste steps are in [`DEPLOY.md`](DEPLOY.md). The one-command path on a VM is `docker compose up -d --build`.
