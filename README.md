# Oakdale Men's Softball

Website for the Oakdale Men's Softball League — league standings, the season schedule, and team rosters.

It's a small full-stack TypeScript app:

- **`server/`** — Express + TypeScript REST API with a zero-dependency JSON-file-backed data store. Computes standings from recorded game results.
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

## Data

Seed data lives in `server/src/seed.ts`. At runtime the API persists to `data/league.json` (git-ignored), so changes made through the app survive restarts.
