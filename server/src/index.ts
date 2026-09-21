import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from './app.js';
import { LeagueStore } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;

const dataDir = process.env.DATA_DIR || join(__dirname, '..', '..', 'data');
const clientDist = join(__dirname, '..', '..', 'client', 'dist');

// LeagueStore treats this as a data directory and opens `${DATA_DIR}/league.db`.
// A sibling `league.json` is imported once on first boot if the DB is empty.
const store = new LeagueStore(dataDir);

// Bootstrap the commissioner (admin) account from the environment.
const adminEmail = process.env.ADMIN_EMAIL || 'admin@oakdale.local';
const adminName = process.env.ADMIN_NAME || 'League Commissioner';
let adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) {
  adminPassword = 'changeme-admin';
  console.warn(
    '[oakdale-softball] ADMIN_PASSWORD not set — using default "changeme-admin". Set ADMIN_PASSWORD in production.',
  );
}
const admin = store.ensureAdmin(adminEmail, adminName, adminPassword);
console.log(`[oakdale-softball] Admin account: ${admin.email}`);

// Demo accounts (admin / team manager / player) are for testing.
// Disable with SEED_DEMO_USERS=false in production.
if (process.env.SEED_DEMO_USERS !== 'false') {
  const teams = store.getTeams();
  const managerEmail = process.env.DEMO_MANAGER_EMAIL || 'manager@oakdale.local';
  const managerName = process.env.DEMO_MANAGER_NAME || 'Team Manager (demo)';
  const managerPassword = process.env.DEMO_MANAGER_PASSWORD || 'ManagerTest2026';
  let seededManagerEmail: string | null = null;
  if (teams.length === 0) {
    console.warn('[oakdale-softball] Skipping demo team manager — no teams exist to assign');
  } else {
    const team = teams[0];
    const manager = store.ensureUser({
      email: managerEmail,
      name: managerName,
      password: managerPassword,
      role: 'manager',
      teamId: team.id,
    });
    seededManagerEmail = manager.email;
    console.log(`[oakdale-softball] Demo team manager assigned to ${team.name} (${team.id})`);
  }

  const playerEmail = process.env.DEMO_PLAYER_EMAIL || 'player@oakdale.local';
  const playerName = process.env.DEMO_PLAYER_NAME || 'Player (demo)';
  const playerPassword = process.env.DEMO_PLAYER_PASSWORD || 'PlayerTest2026';
  const player = store.ensureUser({
    email: playerEmail,
    name: playerName,
    password: playerPassword,
    role: 'player',
    teamId: null,
  });

  console.log(
    `[oakdale-softball] Demo account emails: ${admin.email}, ${seededManagerEmail ?? managerEmail}, ${player.email}`,
  );
}

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.warn(
    '[oakdale-softball] SESSION_SECRET not set — generating an ephemeral secret (sessions reset on restart). Set SESSION_SECRET in production.',
  );
}

const app = createApp(store, {
  clientDist,
  sessionSecret: sessionSecret || randomBytes(32).toString('hex'),
  secureCookies: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== 'true',
});

app.listen(PORT, () => {
  console.log(`[oakdale-softball] API listening on http://localhost:${PORT}`);
});
