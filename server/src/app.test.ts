import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { LeagueStore } from './store.js';

const TEAM_OWN = 'nothin-but-dingers';
const TEAM_OTHER = 'da-beers';
const SEEDED_TEAM_NAMES = [
  'Nothin but Dingers',
  'Sig & Twisted',
  'Camp Boys',
  'Moonlighters',
  'Flying Demons',
  'Da Beers',
  'Here 4 Beer',
  'Whiskey Rebels',
];

function makeApp() {
  const store = new LeagueStore(null);
  store.ensureAdmin('admin@oakdale.local', 'Commish', 'admin-password');
  const app = createApp(store, { sessionSecret: 'test-secret' });
  return { app, store };
}

/** Return a supertest agent logged in as the given credentials. */
async function loginAs(app: ReturnType<typeof createApp>, email: string, password: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return agent;
}

describe('Public read endpoints', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => {
    app = makeApp().app;
  });

  it('reports health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('lists eight seeded teams without auth', async () => {
    const res = await request(app).get('/api/teams');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(8);
    expect(res.body.map((t: { name: string }) => t.name).sort()).toEqual([...SEEDED_TEAM_NAMES].sort());
  });

  it('starts standings at all zeros until games are played', async () => {
    const res = await request(app).get('/api/standings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(8);
    for (const row of res.body) {
      expect(row.wins).toBe(0);
      expect(row.losses).toBe(0);
      expect(row.ties).toBe(0);
      expect(row.gamesPlayed).toBe(0);
      expect(row.runsFor).toBe(0);
      expect(row.runsAgainst).toBe(0);
    }
  });

  it('updates standings after an admin generates a schedule and reports a score', async () => {
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const gen = await admin.post('/api/schedule/generate').send({ startDate: '2026-05-02' });
    expect(gen.status).toBe(201);
    const game = gen.body[0];
    const result = await admin
      .post(`/api/games/${game.id}/result`)
      .send({ homeScore: 7, awayScore: 2 });
    expect(result.status).toBe(200);

    const standings = await request(app).get('/api/standings');
    expect(standings.status).toBe(200);
    const home = standings.body.find((r: { teamId: string }) => r.teamId === game.homeTeamId);
    const away = standings.body.find((r: { teamId: string }) => r.teamId === game.awayTeamId);
    expect(home.wins).toBe(1);
    expect(home.gamesPlayed).toBe(1);
    expect(away.losses).toBe(1);
    expect(away.gamesPlayed).toBe(1);
  });

  it('returns a roster sorted by number', async () => {
    const res = await request(app).get(`/api/teams/${TEAM_OWN}/roster`);
    expect(res.status).toBe(200);
    expect(res.body.team.id).toBe(TEAM_OWN);
    const numbers = res.body.roster.map((p: { number: number }) => p.number);
    expect(numbers).toEqual([...numbers].sort((a: number, b: number) => a - b));
  });
});

describe('Authentication', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => {
    app = makeApp().app;
  });

  it('registers a new member and returns them from /me', async () => {
    const agent = request.agent(app);
    const reg = await agent
      .post('/api/auth/register')
      .send({ email: 'Player1@example.com', name: 'Player One', password: 'supersecret' });
    expect(reg.status).toBe(201);
    expect(reg.body.role).toBe('member');
    expect(reg.body.email).toBe('player1@example.com');
    expect(reg.body.passwordHash).toBeUndefined();

    const me = await agent.get('/api/auth/me');
    expect(me.body.user.email).toBe('player1@example.com');
  });

  it('rejects weak passwords and duplicate emails', async () => {
    const weak = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', name: 'A', password: 'short' });
    expect(weak.status).toBe(400);

    await request(app).post('/api/auth/register').send({ email: 'dup@b.com', name: 'A', password: 'longenough' });
    const dup = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@b.com', name: 'B', password: 'longenough' });
    expect(dup.status).toBe(400);
  });

  it('rejects bad login credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@oakdale.local', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('logs the admin in', async () => {
    const agent = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const me = await agent.get('/api/auth/me');
    expect(me.body.user.role).toBe('admin');
  });
});

describe('Authorization', () => {
  it('blocks anonymous writes', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/players').send({ teamId: TEAM_OWN, name: 'X', number: 1 });
    expect(res.status).toBe(401);
  });

  it('lets an admin add a player to any team', async () => {
    const { app } = makeApp();
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const res = await admin
      .post('/api/players')
      .send({ teamId: TEAM_OTHER, name: 'New Guy', number: 42, position: 'Outfield' });
    expect(res.status).toBe(201);
  });

  it('blocks a plain member from writing', async () => {
    const { app } = makeApp();
    const member = request.agent(app);
    await member.post('/api/auth/register').send({ email: 'm@b.com', name: 'M', password: 'longenough' });
    const res = await member.post('/api/players').send({ teamId: TEAM_OWN, name: 'X', number: 1 });
    expect(res.status).toBe(403);
  });

  it('lets a captain manage only their own team', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'cap@b.com', name: 'Cap', password: 'longenough' });
    const cap = store.getUserByEmail('cap@b.com')!;
    store.setUserRole(cap.id, 'captain', TEAM_OWN);

    const captain = await loginAs(app, 'cap@b.com', 'longenough');

    const own = await captain.post('/api/players').send({ teamId: TEAM_OWN, name: 'Rookie', number: 50 });
    expect(own.status).toBe(201);

    const other = await captain.post('/api/players').send({ teamId: TEAM_OTHER, name: 'Nope', number: 51 });
    expect(other.status).toBe(403);
  });

  it('only lets admins generate the schedule', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'cap@b.com', name: 'Cap', password: 'longenough' });
    store.setUserRole(store.getUserByEmail('cap@b.com')!.id, 'captain', TEAM_OWN);

    const captain = await loginAs(app, 'cap@b.com', 'longenough');
    const denied = await captain.post('/api/schedule/generate').send({ startDate: '2026-07-04' });
    expect(denied.status).toBe(403);

    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const ok = await admin.post('/api/schedule/generate').send({ startDate: '2026-07-08' });
    expect(ok.status).toBe(201);
    // 8 teams × 11 weeks, 4 games per Wednesday night.
    expect(ok.body).toHaveLength(44);
    for (const game of ok.body) {
      expect(game.field).toMatch(/^Field [123]$/);
      expect(['6:00 PM', '7:30 PM']).toContain(game.time);
      expect(game.location).toBe('Kerr Park');
      expect(game.week).toBeGreaterThanOrEqual(1);
      expect(game.week).toBeLessThanOrEqual(11);
      expect(game.homeTeamName).toBeTruthy();
      expect(game.awayTeamName).toBeTruthy();
    }
  });

  it('rejects an invalid weeks value when generating a schedule', async () => {
    const { app } = makeApp();
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const zero = await admin.post('/api/schedule/generate').send({ weeks: 0 });
    expect(zero.status).toBe(400);
    const tooMany = await admin.post('/api/schedule/generate').send({ weeks: 31 });
    expect(tooMany.status).toBe(400);
  });

  it('honors a weeks option when generating the schedule', async () => {
    const { app } = makeApp();
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const ok = await admin.post('/api/schedule/generate').send({ startDate: '2026-05-06', weeks: 2 });
    expect(ok.status).toBe(201);
    expect(ok.body).toHaveLength(8);
    expect(ok.body.every((g: { week: number }) => g.week === 1 || g.week === 2)).toBe(true);
  });

  it('lets a captain report only their own games', async () => {
    const { app, store } = makeApp();
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const gen = await admin.post('/api/schedule/generate').send({ startDate: '2026-05-02' });
    expect(gen.status).toBe(201);
    const games = gen.body as Array<{ id: string; homeTeamId: string; awayTeamId: string }>;
    const ownGame = games.find((g) => g.homeTeamId === TEAM_OWN || g.awayTeamId === TEAM_OWN)!;
    const otherGame = games.find(
      (g) => g.homeTeamId !== TEAM_OWN && g.awayTeamId !== TEAM_OWN,
    )!;
    expect(ownGame).toBeDefined();
    expect(otherGame).toBeDefined();

    store.registerUser({ email: 'cap@b.com', name: 'Cap', password: 'longenough' });
    store.setUserRole(store.getUserByEmail('cap@b.com')!.id, 'captain', TEAM_OWN);
    const captain = await loginAs(app, 'cap@b.com', 'longenough');

    const own = await captain.post(`/api/games/${ownGame.id}/result`).send({ homeScore: 3, awayScore: 9 });
    expect(own.status).toBe(200);
    expect(own.body.field).toBeTruthy();
    expect(own.body.time).toBeTruthy();
    expect(own.body.location).toBe('Kerr Park');
    expect(own.body.week).toBeGreaterThan(0);
    expect(own.body.played).toBe(true);

    const other = await captain.post(`/api/games/${otherGame.id}/result`).send({ homeScore: 1, awayScore: 2 });
    expect(other.status).toBe(403);
  });
});

describe('Admin user management', () => {
  it('lists users and assigns a captain role to a team', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'future.cap@b.com', name: 'Future Cap', password: 'longenough' });
    const target = store.getUserByEmail('future.cap@b.com')!;

    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');

    const list = await admin.get('/api/users');
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(2);

    const assign = await admin
      .post(`/api/users/${target.id}/role`)
      .send({ role: 'captain', teamId: 'flying-demons' });
    expect(assign.status).toBe(200);
    expect(assign.body.role).toBe('captain');
    expect(assign.body.teamId).toBe('flying-demons');

    const badTeam = await admin.post(`/api/users/${target.id}/role`).send({ role: 'captain' });
    expect(badTeam.status).toBe(400);
  });

  it('admins can create teams; members cannot', async () => {
    const { app } = makeApp();
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const created = await admin.post('/api/teams').send({ name: 'Eastside Eagles' });
    expect(created.status).toBe(201);
    expect(created.body.id).toBe('eastside-eagles');

    const anon = await request(app).post('/api/teams').send({ name: 'Nope FC' });
    expect(anon.status).toBe(401);
  });
});

describe('Admin team rename', () => {
  it('lets an admin rename a team and keeps the id stable', async () => {
    const { app } = makeApp();
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const put = await admin.put(`/api/teams/${TEAM_OWN}`).send({ name: '  Dingers United  ' });
    expect(put.status).toBe(200);
    expect(put.body.id).toBe(TEAM_OWN);
    expect(put.body.name).toBe('Dingers United');

    const list = await request(app).get('/api/teams');
    const renamed = list.body.find((t: { id: string }) => t.id === TEAM_OWN);
    expect(renamed.name).toBe('Dingers United');
  });

  it('blocks anonymous team renames', async () => {
    const { app } = makeApp();
    const res = await request(app).put(`/api/teams/${TEAM_OWN}`).send({ name: 'Hacked' });
    expect(res.status).toBe(401);
  });

  it('blocks a plain member from renaming a team', async () => {
    const { app } = makeApp();
    const member = request.agent(app);
    await member.post('/api/auth/register').send({ email: 'm@b.com', name: 'M', password: 'longenough' });
    const res = await member.put(`/api/teams/${TEAM_OWN}`).send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown team id', async () => {
    const { app } = makeApp();
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const res = await admin.put('/api/teams/no-such-team').send({ name: 'Ghosts' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for an empty name', async () => {
    const { app } = makeApp();
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const res = await admin.put(`/api/teams/${TEAM_OWN}`).send({ name: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('League rules', () => {
  it('returns rules as a string to anyone without auth', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/rules');
    expect(res.status).toBe(200);
    expect(typeof res.body.rules).toBe('string');
    expect(res.body.rules.length).toBeGreaterThan(0);
  });

  it('blocks anonymous rule edits', async () => {
    const { app } = makeApp();
    const res = await request(app).put('/api/rules').send({ rules: 'Hacked rules' });
    expect(res.status).toBe(401);
  });

  it('blocks a plain member from editing rules', async () => {
    const { app } = makeApp();
    const member = request.agent(app);
    await member.post('/api/auth/register').send({ email: 'm@b.com', name: 'M', password: 'longenough' });
    const res = await member.put('/api/rules').send({ rules: 'Member rules' });
    expect(res.status).toBe(403);
  });

  it('lets an admin update the rules and reflects them on a subsequent read', async () => {
    const { app } = makeApp();
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const updated = 'Rule 1: Have fun.\nRule 2: Bring snacks.';
    const put = await admin.put('/api/rules').send({ rules: updated });
    expect(put.status).toBe(200);
    expect(put.body.rules).toBe(updated);

    const get = await request(app).get('/api/rules');
    expect(get.status).toBe(200);
    expect(get.body.rules).toBe(updated);
  });

  it('rejects non-string and oversized rule payloads from an admin', async () => {
    const { app } = makeApp();
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');

    const notString = await admin.put('/api/rules').send({ rules: 42 });
    expect(notString.status).toBe(400);

    const tooBig = await admin.put('/api/rules').send({ rules: 'x'.repeat(20001) });
    expect(tooBig.status).toBe(400);
  });
});
