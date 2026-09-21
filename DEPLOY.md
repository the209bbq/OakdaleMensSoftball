# Deploying Oakdale Men's Softball

Once this site is deployed on a VM or host, it is **independent of any personal PC**. The API serves the built React client and writes league data to SQLite at `$DATA_DIR/league.db` (default `/data` in the production image). Point `DATA_DIR` at a **persistent volume** so standings, rosters, and accounts survive restarts.

**Production checklist**

- Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME`. Do not run production without a strong `ADMIN_PASSWORD`.
- Set `SESSION_SECRET` (generate with `openssl rand -hex 32`) so logins survive restarts.
- Set `SEED_DEMO_USERS=false` so the demo manager/player logins are **not** created. Demo passwords (`DEMO_MANAGER_PASSWORD` / `DEMO_PLAYER_PASSWORD`) only apply when demo seeding is left on.
- `NODE_ENV=production` enables secure cookies (HTTPS). For local HTTP only, set `INSECURE_COOKIES=true`.

On first boot, if `league.db` is empty and a legacy `$DATA_DIR/league.json` is present, that file is imported into SQLite and renamed to `league.json.imported` (it is not deleted). Subsequent boots use only the SQLite file.

Health check: `GET /api/health`.

---

## A. Free + always-on: Oracle Cloud Always Free VM (recommended for $0)

Oracle Cloud’s **Always Free** tier can run a small Ubuntu VM 24/7 at no charge. Ampere/ARM (A1) is the generous Always Free shape and **works here**: the production image is `node:22-bookworm-slim`, and `better-sqlite3` ships **arm64** (and amd64) prebuilds, so you do not need a compiler on ARM.

### 1. Create the VM

1. Sign up at [Oracle Cloud](https://www.oracle.com/cloud/free/) (credit card for identity; Always Free resources are $0).
2. Create a compute instance:
   - Image: **Ubuntu** (22.04 or 24.04).
   - Shape: **VM.Standard.A1.Flex** (Ampere/ARM) — Always Free eligible. AMD micro is fine too if A1 capacity is exhausted.
   - Assign a public IPv4 address.
   - Download / save the SSH key.
3. SSH in:

```bash
ssh -i /path/to/your-key ubuntu@YOUR_PUBLIC_IP
```

### 2. Open the firewall / port

You only need public 80/443 if you terminate HTTPS on the VM (**Caddy**). A **Cloudflare Tunnel** is outbound-only — then skip this step (SSH/port 22 is enough).

Oracle has two layers; open **both**:

**OCI Networking** → your VCN → Security Lists (or NSG) → Ingress:

- TCP **80** from `0.0.0.0/0` (destination port; leave source port empty)
- TCP **443** from `0.0.0.0/0`

**On the Ubuntu VM** (OCI images ship restrictive iptables):

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo apt-get update && sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

If you publish the app port directly instead of Caddy, also allow TCP **3001** the same way.

### 3. Install Docker + the Compose plugin

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
newgrp docker
```

(`newgrp docker` starts a session with the docker group so you do not need `sudo docker` for the rest of this guide.)

### 4. Clone, configure, start

```bash
git clone https://github.com/the209bbq/OakdaleMensSoftball.git
cd OakdaleMensSoftball
cp .env.example .env
```

Edit `.env`:

- Strong `ADMIN_PASSWORD`
- `SESSION_SECRET` from `openssl rand -hex 32`
- `ADMIN_EMAIL` / `ADMIN_NAME` for the commissioner login
- `SEED_DEMO_USERS=false`
- leave `NODE_ENV=production` and `PORT=3001`

Then:

```bash
docker compose up -d --build
curl -fsS http://127.0.0.1:3001/api/health
```

The site is now running on the VM. Data lives in the Docker volume **`oakdale-data`** at `/data/league.db` (plus SQLite WAL sidecars). Redeploys and VM reboots keep that volume.

### 5. HTTPS (pick one)

#### Option 1 — Free Cloudflare Tunnel (no domain needed)

Cloudflare Tunnel gives you HTTPS without opening 80/443 on Oracle. A **Quick Tunnel** needs no domain (hostname is `*.trycloudflare.com`). A **named tunnel installed as a service** stays up across reboots; add a hostname in a free Cloudflare account when you want a stable URL.

```bash
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared
```

**No domain (Quick Tunnel, `*.trycloudflare.com`):**

```bash
cloudflared tunnel --url http://localhost:3001
```

The command prints an `https://….trycloudflare.com` URL. For a process that survives logout/reboot, install a systemd unit that runs that same command (`Restart=always`). The trycloudflare hostname can change when the process restarts.

**Named / persistent tunnel (recommended):**

```bash
cloudflared tunnel login
cloudflared tunnel create oakdale
```

Note the tunnel UUID and credentials path printed by `create`. Write `~/.cloudflared/config.yml` (fix the UUID and home directory):

```yaml
tunnel: oakdale
credentials-file: /home/ubuntu/.cloudflared/<TUNNEL-UUID>.json
ingress:
  - service: http://localhost:3001
```

Install as a service:

```bash
sudo cloudflared --config /home/$USER/.cloudflared/config.yml service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

Give it a public hostname from a free Cloudflare account (any zone you add — you do not buy hosting). Either:

```bash
cloudflared tunnel route dns oakdale your-hostname.example.com
```

or create the tunnel in **Zero Trust → Networks → Tunnels**, then on the VM:

```bash
sudo cloudflared service install <TOKEN>
```

and attach a Public Hostname in the dashboard.

#### Option 2 — Caddy in front (custom domain, auto-HTTPS)

Point the domain’s A record at the VM’s public IP. Open 80/443 as in step 2. On the VM:

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

`/etc/caddy/Caddyfile`:

```caddy
your-domain.example.com {
	reverse_proxy localhost:3001
}
```

```bash
sudo systemctl reload caddy
```

Caddy obtains and renews Let’s Encrypt certificates automatically.

### 6. Backup SQLite

Data is the named Docker volume `oakdale-data` → `/data/league.db`. Copy the database file:

```bash
docker run --rm -v oakdale-data:/data -v $PWD:/backup busybox cp /data/league.db /backup
```

For a fully consistent snapshot, stop the app first (`docker compose stop`) or copy the whole `/data` directory (includes `league.db-wal` / `league.db-shm`). Restore by copying `league.db` back into the volume and starting the app.

---

## B. Free, hands-off but sleeps: Render free web + free managed Postgres

This is **informational** — not a copy-paste deploy of this repo today.

- A **Render free web service** costs $0 and needs almost no ops, but the instance **spins down after idle** and cold-starts on the next request. Persistent disks are **not** available on the free web plan, so the current SQLite-on-disk setup does not fit.
- A **free managed Postgres** (Neon, Supabase, or similar) stays **always-on and durable**. Pairing a sleeping web dyno with always-on Postgres is a common $0 pattern.

**Tradeoff:** you get a durable database and a hands-off host, but visitors may wait on a cold start, and this codebase stores league data in **SQLite**. Using Neon/Supabase would require a **small Postgres storage adapter, which is not in the repo yet** (available follow-up). Until that exists, use Oracle + Docker (section A), Fly (section C), or Render’s paid disk (section D).

---

## C. Nearly free, keeps SQLite: Fly.io

Fly.io runs the same Docker image with a persistent volume for `league.db`. Typical cost is about **$1–3/month** for the smallest shared-CPU VM plus a 1 GB volume. A credit card is required; it is not a $0 Always Free VM.

This repo includes `fly.toml` (internal port 3001, HTTPS, volume `oakdale_data` → `/data`, `NODE_ENV=production`, `SEED_DEMO_USERS=false`). Build uses the root `Dockerfile`.

```bash
# From the repo root (install flyctl first: https://fly.io/docs/flyctl/install/)
fly launch --copy-config --no-deploy
# Accept the placeholder app name or pick your own.

fly volumes create oakdale_data --size 1
# If launch already created oakdale_data (fly.toml initial_size), skip this.

fly secrets set \
  ADMIN_EMAIL=you@example.com \
  ADMIN_NAME="League Commissioner" \
  ADMIN_PASSWORD='choose-a-strong-password' \
  SESSION_SECRET="$(openssl rand -hex 32)"

fly deploy
```

`fly.toml` does **not** contain passwords. Open the app URL Fly prints, hit `/api/health`, then sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

---

## D. Easiest paid: Render blueprint (~$7/mo) or any VPS via Docker Compose

### Render Blueprint (paid disk)

Persistent disks are not available on Render’s free plan. This repo’s `render.yaml` uses `plan: starter` (~$7/month) plus a 1 GB disk at `/data`.

1. In the [Render Dashboard](https://dashboard.render.com), create a new Blueprint from this repo (`render.yaml`).
2. Choose a **paid** instance type (Starter).
3. Set the dashboard secrets (Blueprint `sync: false` vars):
   - `ADMIN_EMAIL` — commissioner login (e.g. `you@example.com`)
   - `ADMIN_NAME` — display name
   - `ADMIN_PASSWORD` — strong password
4. Confirm `SESSION_SECRET` was generated (`generateValue: true`) and `DATA_DIR=/data`.
5. Confirm the `data` disk is attached at `/data` (1 GB). `league.db` lives there across deploys. A leftover `league.json` is imported once on first boot.
6. After the first deploy, open `/api/health` then sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

Render sets `PORT` automatically. `npm start` serves the production build from `client/dist`.

Set `SEED_DEMO_USERS=false` in the Render dashboard if you do not want demo logins (the Blueprint does not currently set that variable).

### Any VPS (Docker Compose)

Same as Oracle, minus Always Free constraints. On Ubuntu:

```bash
git clone https://github.com/the209bbq/OakdaleMensSoftball.git
cd OakdaleMensSoftball
cp .env.example .env
# fill ADMIN_* and SESSION_SECRET; keep SEED_DEMO_USERS=false
docker compose up -d --build
```

Map `${PORT:-3001}:3001`, data in volume `oakdale-data`. Put Caddy/nginx or a Cloudflare Tunnel in front for HTTPS.

### Plain `docker run` (no Compose)

```bash
docker build -t oakdale-softball .
docker run --name oakdale \
  --restart unless-stopped \
  -p 3001:3001 \
  -v oakdale-data:/data \
  --env-file .env \
  oakdale-softball
```

- Data is `/data` inside the container (`league.db`, plus WAL sidecar files). The `oakdale-data` volume keeps it across container recreation. If you are upgrading from the JSON store, leave `league.json` in that volume for the first boot so it can be imported.
- Listen port is `3001` (`EXPOSE 3001`); map it however you like (`-p 80:3001`).
- Behind HTTPS, leave cookies secure (default when `NODE_ENV=production`). For local HTTP only, set `INSECURE_COOKIES=true`.
