import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createApp } from './app.js';
import { LeagueStore } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;

const dataFile = join(__dirname, '..', '..', 'data', 'league.json');
const clientDist = join(__dirname, '..', '..', 'client', 'dist');

const store = new LeagueStore(dataFile);
const app = createApp(store, clientDist);

app.listen(PORT, () => {
  console.log(`[oakdale-softball] API listening on http://localhost:${PORT}`);
});
