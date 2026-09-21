# Deploying Oakdale Men's Softball

The API serves the built React client and writes league data to a JSON file at `$DATA_DIR/league.json` (default `/data` in production). Point `DATA_DIR` at a **persistent volume** so standings, rosters, and accounts survive redeploys. Do not run production without `ADMIN_PASSWORD` and `SESSION_SECRET`.

## Render (Blueprint)

1. In the [Render Dashboard](https://dashboard.render.com), create a new Blueprint from this repo (`render.yaml`).
2. Choose a **paid** instance type. Persistent disks are not available on the free plan; this Blueprint uses `plan: starter`.
3. Set the dashboard secrets (Blueprint `sync: false` vars):
   - `ADMIN_EMAIL` — commissioner login (e.g. `you@example.com`)
   - `ADMIN_NAME` — display name
   - `ADMIN_PASSWORD` — strong password
4. Confirm `SESSION_SECRET` was generated (`generateValue: true`) and `DATA_DIR=/data`.
5. Confirm the `data` disk is attached at `/data` (1 GB). League JSON lives there across deploys.
6. After the first deploy, open `/api/health` then sign in at the site with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

Render sets `PORT` automatically. `npm start` serves the production build from `client/dist`.

## Docker (any host)

Build:

```bash
docker build -t oakdale-softball .
```

Run with a named volume for durable data:

```bash
docker run --name oakdale \
  -p 3001:3001 \
  -v oakdale-data:/data \
  -e ADMIN_EMAIL=you@example.com \
  -e ADMIN_NAME="League Commissioner" \
  -e ADMIN_PASSWORD='choose-a-strong-password' \
  -e SESSION_SECRET='choose-a-long-random-secret' \
  oakdale-softball
```

- Data is stored in `/data` inside the container (`league.json`). The `-v oakdale-data:/data` mount keeps it on a persistent volume.
- Listen port is `3001` (`EXPOSE 3001`); map it however you like (`-p 80:3001`).
- Behind HTTPS, leave cookies secure (default when `NODE_ENV=production`). For local HTTP only, set `INSECURE_COOKIES=true`.

Health check: `GET /api/health`.
