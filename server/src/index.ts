import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from './app.js';
import { LeagueStore } from './store.js';
import { seedDemoUsers } from './demoUsers.js';

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
// Create-only: existing demo accounts are never overwritten on restart.
if (process.env.SEED_DEMO_USERS !== 'false') {
  const seeded = seedDemoUsers(store, {
    managerEmail: process.env.DEMO_MANAGER_EMAIL || 'manager@oakdale.local',
    managerName: process.env.DEMO_MANAGER_NAME || 'Team Manager (demo)',
    managerPassword: process.env.DEMO_MANAGER_PASSWORD || 'ManagerTest2026',
    playerEmail: process.env.DEMO_PLAYER_EMAIL || 'player@oakdale.local',
    playerName: process.env.DEMO_PLAYER_NAME || 'Player (demo)',
    playerPassword: process.env.DEMO_PLAYER_PASSWORD || 'PlayerTest2026',
  });
  console.log(
    `[oakdale-softball] Demo account emails: ${admin.email}, ${seeded.managerEmail}, ${seeded.playerEmail}`,
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
