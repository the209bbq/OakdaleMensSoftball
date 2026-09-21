import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from './app.js';
import { LeagueStore } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;

const dataDir = process.env.DATA_DIR || join(__dirname, '..', '..', 'data');
const dataFile = join(dataDir, 'league.json');
const clientDist = join(__dirname, '..', '..', 'client', 'dist');

const store = new LeagueStore(dataFile);

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
