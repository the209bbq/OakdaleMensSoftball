import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { LeagueStore, SIM_EMAIL_DOMAIN } from './store.js';
import { seedDemoUsers } from './demoUsers.js';

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

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function addUtcDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

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
    expect(Array.isArray(res.body.members)).toBe(true);
  });
});

describe('Authentication', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => {
    app = makeApp().app;
  });

  it('registers a new player and returns them from /me', async () => {
    const agent = request.agent(app);
    const reg = await agent
      .post('/api/auth/register')
      .send({ email: 'Player1@example.com', name: 'Player One', password: 'supersecret' });
    expect(reg.status).toBe(201);
    expect(reg.body.role).toBe('player');
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

  it('blocks a plain player from writing', async () => {
    const { app } = makeApp();
    const player = request.agent(app);
    await player.post('/api/auth/register').send({ email: 'm@b.com', name: 'M', password: 'longenough' });
    const res = await player.post('/api/players').send({ teamId: TEAM_OWN, name: 'X', number: 1 });
    expect(res.status).toBe(403);
  });

  it('lets a manager manage only their own team', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'mgr@b.com', name: 'Mgr', password: 'longenough' });
    const mgr = store.getUserByEmail('mgr@b.com')!;
    store.setUserRole(mgr.id, 'manager', TEAM_OWN);

    const manager = await loginAs(app, 'mgr@b.com', 'longenough');

    const own = await manager.post('/api/players').send({ teamId: TEAM_OWN, name: 'Rookie', number: 50 });
    expect(own.status).toBe(201);

    const other = await manager.post('/api/players').send({ teamId: TEAM_OTHER, name: 'Nope', number: 51 });
    expect(other.status).toBe(403);
  });

  it('only lets admins generate the schedule', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'mgr@b.com', name: 'Mgr', password: 'longenough' });
    store.setUserRole(store.getUserByEmail('mgr@b.com')!.id, 'manager', TEAM_OWN);

    const manager = await loginAs(app, 'mgr@b.com', 'longenough');
    const denied = await manager.post('/api/schedule/generate').send({ startDate: '2026-07-04' });
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

  it('lets a manager report only their own games', async () => {
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

    store.registerUser({ email: 'mgr@b.com', name: 'Mgr', password: 'longenough' });
    store.setUserRole(store.getUserByEmail('mgr@b.com')!.id, 'manager', TEAM_OWN);
    const manager = await loginAs(app, 'mgr@b.com', 'longenough');

    const own = await manager.post(`/api/games/${ownGame.id}/result`).send({ homeScore: 3, awayScore: 9 });
    expect(own.status).toBe(200);
    expect(own.body.field).toBeTruthy();
    expect(own.body.time).toBeTruthy();
    expect(own.body.location).toBe('Kerr Park');
    expect(own.body.week).toBeGreaterThan(0);
    expect(own.body.played).toBe(true);

    const other = await manager.post(`/api/games/${otherGame.id}/result`).send({ homeScore: 1, awayScore: 2 });
    expect(other.status).toBe(403);
  });
});

describe('Admin user management', () => {
  it('lists users and assigns a manager role to a team', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'future.mgr@b.com', name: 'Future Mgr', password: 'longenough' });
    const target = store.getUserByEmail('future.mgr@b.com')!;

    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');

    const list = await admin.get('/api/users');
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(2);

    const assign = await admin
      .post(`/api/users/${target.id}/role`)
      .send({ role: 'manager', teamId: 'flying-demons' });
    expect(assign.status).toBe(200);
    expect(assign.body.role).toBe('manager');
    expect(assign.body.teamId).toBe('flying-demons');

    const badTeam = await admin.post(`/api/users/${target.id}/role`).send({ role: 'manager' });
    expect(badTeam.status).toBe(400);
  });

  it('admins can create teams; players cannot', async () => {
    const { app } = makeApp();
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const created = await admin.post('/api/teams').send({ name: 'Eastside Eagles' });
    expect(created.status).toBe(201);
    expect(created.body.id).toBe('eastside-eagles');

    const anon = await request(app).post('/api/teams').send({ name: 'Nope FC' });
    expect(anon.status).toBe(401);
  });
});

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('Team rename', () => {
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

  it('lets a manager rename their own team', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'mgr@b.com', name: 'Mgr', password: 'longenough' });
    store.setUserRole(store.getUserByEmail('mgr@b.com')!.id, 'manager', TEAM_OWN);
    const manager = await loginAs(app, 'mgr@b.com', 'longenough');

    const put = await manager.put(`/api/teams/${TEAM_OWN}`).send({ name: 'Dingers FC' });
    expect(put.status).toBe(200);
    expect(put.body.id).toBe(TEAM_OWN);
    expect(put.body.name).toBe('Dingers FC');
  });

  it('blocks a manager from renaming another team', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'mgr@b.com', name: 'Mgr', password: 'longenough' });
    store.setUserRole(store.getUserByEmail('mgr@b.com')!.id, 'manager', TEAM_OWN);
    const manager = await loginAs(app, 'mgr@b.com', 'longenough');

    const res = await manager.put(`/api/teams/${TEAM_OTHER}`).send({ name: 'Stolen Name' });
    expect(res.status).toBe(403);
  });

  it('blocks anonymous team renames', async () => {
    const { app } = makeApp();
    const res = await request(app).put(`/api/teams/${TEAM_OWN}`).send({ name: 'Hacked' });
    expect(res.status).toBe(401);
  });

  it('blocks a plain player from renaming a team', async () => {
    const { app } = makeApp();
    const player = request.agent(app);
    await player.post('/api/auth/register').send({ email: 'm@b.com', name: 'M', password: 'longenough' });
    const res = await player.put(`/api/teams/${TEAM_OWN}`).send({ name: 'Nope' });
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

describe('Team photo', () => {
  it('lets a manager set their own team photo and reflects it on GET', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'mgr@b.com', name: 'Mgr', password: 'longenough' });
    store.setUserRole(store.getUserByEmail('mgr@b.com')!.id, 'manager', TEAM_OWN);
    const manager = await loginAs(app, 'mgr@b.com', 'longenough');

    const put = await manager.put(`/api/teams/${TEAM_OWN}/photo`).send({ photoUrl: TINY_PNG });
    expect(put.status).toBe(200);
    expect(put.body.id).toBe(TEAM_OWN);
    expect(put.body.photoUrl).toBe(TINY_PNG);

    const list = await request(app).get('/api/teams');
    const team = list.body.find((t: { id: string }) => t.id === TEAM_OWN);
    expect(team.photoUrl).toBe(TINY_PNG);

    const roster = await request(app).get(`/api/teams/${TEAM_OWN}/roster`);
    expect(roster.body.team.photoUrl).toBe(TINY_PNG);
  });

  it('blocks a manager from setting another team photo', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'mgr@b.com', name: 'Mgr', password: 'longenough' });
    store.setUserRole(store.getUserByEmail('mgr@b.com')!.id, 'manager', TEAM_OWN);
    const manager = await loginAs(app, 'mgr@b.com', 'longenough');

    const res = await manager.put(`/api/teams/${TEAM_OTHER}/photo`).send({ photoUrl: TINY_PNG });
    expect(res.status).toBe(403);
  });

  it('rejects a non-data-url team photo', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'mgr@b.com', name: 'Mgr', password: 'longenough' });
    store.setUserRole(store.getUserByEmail('mgr@b.com')!.id, 'manager', TEAM_OWN);
    const manager = await loginAs(app, 'mgr@b.com', 'longenough');

    const res = await manager
      .put(`/api/teams/${TEAM_OWN}/photo`)
      .send({ photoUrl: 'https://example.com/logo.png' });
    expect(res.status).toBe(400);
  });

  it('rejects an oversized team photo', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'mgr@b.com', name: 'Mgr', password: 'longenough' });
    store.setUserRole(store.getUserByEmail('mgr@b.com')!.id, 'manager', TEAM_OWN);
    const manager = await loginAs(app, 'mgr@b.com', 'longenough');

    const res = await manager
      .put(`/api/teams/${TEAM_OWN}/photo`)
      .send({ photoUrl: `data:image/png;base64,${'A'.repeat(800000)}` });
    expect(res.status).toBe(400);
  });
});

describe('Player profile', () => {
  it('requires auth to update a profile', async () => {
    const { app } = makeApp();
    const res = await request(app).put('/api/auth/profile').send({ name: 'Nope' });
    expect(res.status).toBe(401);
  });

  it('rejects an empty name', async () => {
    const { app } = makeApp();
    const player = request.agent(app);
    await player.post('/api/auth/register').send({ email: 'p@b.com', name: 'Pat', password: 'longenough' });
    const res = await player.put('/api/auth/profile').send({ name: '   ' });
    expect(res.status).toBe(400);
  });

  it('updates name, position, number, and photo and reflects them on /me', async () => {
    const { app } = makeApp();
    const player = request.agent(app);
    await player.post('/api/auth/register').send({ email: 'p@b.com', name: 'Pat', password: 'longenough' });

    const put = await player.put('/api/auth/profile').send({
      name: 'Pat Shortstop',
      position: 'SS',
      number: 12,
      photoUrl: TINY_PNG,
    });
    expect(put.status).toBe(200);
    expect(put.body.name).toBe('Pat Shortstop');
    expect(put.body.position).toBe('SS');
    expect(put.body.number).toBe(12);
    expect(put.body.photoUrl).toBe(TINY_PNG);
    expect(put.body.passwordHash).toBeUndefined();
    expect('passwordHash' in put.body).toBe(false);

    const me = await player.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.name).toBe('Pat Shortstop');
    expect(me.body.user.position).toBe('SS');
    expect(me.body.user.number).toBe(12);
    expect(me.body.user.photoUrl).toBe(TINY_PNG);
    expect(me.body.user.passwordHash).toBeUndefined();
  });

  it('rejects an invalid profile photo', async () => {
    const { app } = makeApp();
    const player = request.agent(app);
    await player.post('/api/auth/register').send({ email: 'p@b.com', name: 'Pat', password: 'longenough' });
    const res = await player.put('/api/auth/profile').send({
      name: 'Pat',
      photoUrl: 'not-a-data-url',
    });
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

  it('blocks a plain player from editing rules', async () => {
    const { app } = makeApp();
    const player = request.agent(app);
    await player.post('/api/auth/register').send({ email: 'm@b.com', name: 'M', password: 'longenough' });
    const res = await player.put('/api/rules').send({ rules: 'Player rules' });
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

describe('Landing page', () => {
  it('returns default landing content to anyone without auth', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/landing');
    expect(res.status).toBe(200);
    expect(res.body.headline).toBe('Welcome to the Oakdale Mens Softball League');
    expect(res.body.body).toMatch(/TODO: add real content/i);
    expect(res.body.imageUrl).toBeNull();
    expect(res.body.countdownLabel).toBe('Opening Day');
    expect(res.body.countdownTarget).toBeNull();
    expect(res.body.effectiveCountdownTarget).toBeNull();
  });

  it('derives effectiveCountdownTarget from the earliest scheduled game', async () => {
    const { app } = makeApp();
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const gen = await admin.post('/api/schedule/generate').send({ startDate: '2026-05-06' });
    expect(gen.status).toBe(201);
    const first = gen.body[0];
    expect(first.date).toBe('2026-05-06');
    expect(first.time).toBe('6:00 PM');

    const res = await request(app).get('/api/landing');
    expect(res.status).toBe(200);
    expect(res.body.countdownTarget).toBeNull();
    expect(res.body.effectiveCountdownTarget).toBe('2026-05-06T18:00:00');
  });

  it('blocks anonymous landing edits', async () => {
    const { app } = makeApp();
    const res = await request(app).put('/api/landing').send({ headline: 'Hacked' });
    expect(res.status).toBe(401);
  });

  it('blocks a plain player from editing the landing page', async () => {
    const { app } = makeApp();
    const player = request.agent(app);
    await player.post('/api/auth/register').send({ email: 'm@b.com', name: 'M', password: 'longenough' });
    const res = await player.put('/api/landing').send({ headline: 'Player headline' });
    expect(res.status).toBe(403);
  });

  it('lets an admin update landing fields and reflects them on a subsequent read', async () => {
    const { app } = makeApp();
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const put = await admin.put('/api/landing').send({
      headline: 'Season opener week',
      body: 'Bring your gloves.\nSee you at Kerr Park.',
      countdownLabel: 'First pitch',
      countdownTarget: '2026-09-23T18:00:00',
    });
    expect(put.status).toBe(200);
    expect(put.body.headline).toBe('Season opener week');
    expect(put.body.body).toBe('Bring your gloves.\nSee you at Kerr Park.');
    expect(put.body.countdownLabel).toBe('First pitch');
    expect(put.body.countdownTarget).toBe('2026-09-23T18:00:00');
    expect(put.body.effectiveCountdownTarget).toBe('2026-09-23T18:00:00');

    const get = await request(app).get('/api/landing');
    expect(get.status).toBe(200);
    expect(get.body.headline).toBe('Season opener week');
    expect(get.body.body).toBe('Bring your gloves.\nSee you at Kerr Park.');
    expect(get.body.countdownLabel).toBe('First pitch');
    expect(get.body.countdownTarget).toBe('2026-09-23T18:00:00');
    expect(get.body.effectiveCountdownTarget).toBe('2026-09-23T18:00:00');
  });

  it('rejects an invalid banner image or unparseable countdownTarget', async () => {
    const { app } = makeApp();
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');

    const badImage = await admin.put('/api/landing').send({ imageUrl: 'https://example.com/banner.png' });
    expect(badImage.status).toBe(400);

    const huge = await admin.put('/api/landing').send({
      imageUrl: `data:image/jpeg;base64,${'a'.repeat(800001)}`,
    });
    expect(huge.status).toBe(400);

    const badDate = await admin.put('/api/landing').send({ countdownTarget: 'not-a-date' });
    expect(badDate.status).toBe(400);
  });
});

describe('LeagueStore role backfill and ensureUser', () => {
  it('maps legacy captain/member roles to manager/player when loading a data file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oakdale-legacy-roles-'));
    const file = join(dir, 'league.json');
    writeFileSync(
      file,
      JSON.stringify({
        teams: [{ id: 'camp-boys', name: 'Camp Boys' }],
        players: [],
        games: [],
        users: [
          {
            id: 'u-cap',
            email: 'legacy.cap@oakdale.local',
            name: 'Old Captain',
            role: 'captain',
            teamId: 'camp-boys',
            passwordHash: 'scrypt$00$00',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'u-mem',
            email: 'legacy.mem@oakdale.local',
            name: 'Old Member',
            role: 'member',
            teamId: null,
            passwordHash: 'scrypt$00$00',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'u-adm',
            email: 'legacy.adm@oakdale.local',
            name: 'Old Admin',
            role: 'admin',
            teamId: null,
            passwordHash: 'scrypt$00$00',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        rules: 'legacy rules',
      }),
    );

    try {
      const store = new LeagueStore(file);
      expect(store.getUserByEmail('legacy.cap@oakdale.local')?.role).toBe('manager');
      expect(store.getUserByEmail('legacy.cap@oakdale.local')?.teamId).toBe('camp-boys');
      expect(store.getUserByEmail('legacy.mem@oakdale.local')?.role).toBe('player');
      expect(store.getUserByEmail('legacy.adm@oakdale.local')?.role).toBe('admin');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ensureUser creates a missing user and updates role/team on an existing one', () => {
    const store = new LeagueStore(null);
    const created = store.ensureUser({
      email: 'Mgr@B.com',
      name: 'Demo Manager',
      password: 'longenough',
      role: 'player',
      teamId: null,
    });
    expect(created.email).toBe('mgr@b.com');
    expect(created.role).toBe('player');
    expect(created.teamId).toBeNull();
    expect('passwordHash' in created).toBe(false);
    expect(store.getUserByEmail('mgr@b.com')?.passwordHash).toBeTruthy();

    const updated = store.ensureUser({
      email: 'mgr@b.com',
      name: 'Ignored Name',
      password: 'different-password-that-should-not-apply',
      role: 'manager',
      teamId: TEAM_OWN,
    });
    expect(updated.role).toBe('manager');
    expect(updated.teamId).toBe(TEAM_OWN);
    const stored = store.getUserByEmail('mgr@b.com')!;
    expect(stored.role).toBe('manager');
    expect(stored.teamId).toBe(TEAM_OWN);
    expect(stored.name).toBe('Demo Manager');
    expect(store.authenticate('mgr@b.com', 'longenough')).not.toBeNull();
    expect(store.authenticate('mgr@b.com', 'different-password-that-should-not-apply')).toBeNull();
  });
});

describe('seedDemoUsers create-only bootstrap', () => {
  const silentLog = { log: () => {}, warn: () => {} };
  const demoOpts = {
    managerEmail: 'manager@oakdale.local',
    managerName: 'Team Manager (demo)',
    managerPassword: 'ManagerTest2026',
    playerEmail: 'player@oakdale.local',
    playerName: 'Player (demo)',
    playerPassword: 'PlayerTest2026',
    log: silentLog,
  };

  it('creates a missing demo manager on the first team and a demo player with no team', () => {
    const store = new LeagueStore(null);
    const logs: string[] = [];
    const firstTeam = store.getTeams()[0];
    expect(firstTeam).toBeTruthy();

    const result = seedDemoUsers(store, {
      ...demoOpts,
      log: { log: (msg) => logs.push(String(msg)), warn: () => {} },
    });

    expect(result.managerCreated).toBe(true);
    expect(result.playerCreated).toBe(true);
    expect(logs.some((line) => line.includes(`Demo team manager assigned to ${firstTeam.name}`))).toBe(
      true,
    );

    const manager = store.getUserByEmail('manager@oakdale.local')!;
    expect(manager.role).toBe('manager');
    expect(manager.teamId).toBe(firstTeam.id);
    expect(manager.name).toBe('Team Manager (demo)');
    expect(store.authenticate('manager@oakdale.local', 'ManagerTest2026')).not.toBeNull();

    const player = store.getUserByEmail('player@oakdale.local')!;
    expect(player.role).toBe('player');
    expect(player.teamId).toBeNull();
    expect(player.name).toBe('Player (demo)');
    expect(store.authenticate('player@oakdale.local', 'PlayerTest2026')).not.toBeNull();
  });

  it('does not overwrite existing demo accounts on a second bootstrap (restart)', () => {
    const store = new LeagueStore(null);
    const firstTeam = store.getTeams()[0];
    const otherTeam = store.getTeams().find((t) => t.id !== firstTeam.id)!;
    expect(otherTeam).toBeTruthy();

    seedDemoUsers(store, demoOpts);

    const manager = store.getUserByEmail('manager@oakdale.local')!;
    store.setUserRole(manager.id, 'manager', otherTeam.id);
    store.updateProfile(manager.id, { name: 'Reassigned Manager' });

    const player = store.getUserByEmail('player@oakdale.local')!;
    store.setUserTeam(player.id, otherTeam.id);
    store.updateProfile(player.id, { name: 'Joined Player' });

    const assignmentLogs: string[] = [];
    const second = seedDemoUsers(store, {
      ...demoOpts,
      managerName: 'Would Clobber Manager Name',
      managerPassword: 'WouldClobberPassword',
      playerName: 'Would Clobber Player Name',
      playerPassword: 'WouldClobberPassword',
      log: { log: (msg) => assignmentLogs.push(String(msg)), warn: () => {} },
    });

    expect(second.managerCreated).toBe(false);
    expect(second.playerCreated).toBe(false);
    expect(assignmentLogs.some((line) => line.includes('Demo team manager assigned'))).toBe(false);

    const managerAfter = store.getUserByEmail('manager@oakdale.local')!;
    expect(managerAfter.role).toBe('manager');
    expect(managerAfter.teamId).toBe(otherTeam.id);
    expect(managerAfter.name).toBe('Reassigned Manager');
    expect(store.authenticate('manager@oakdale.local', 'ManagerTest2026')).not.toBeNull();
    expect(store.authenticate('manager@oakdale.local', 'WouldClobberPassword')).toBeNull();

    const playerAfter = store.getUserByEmail('player@oakdale.local')!;
    expect(playerAfter.role).toBe('player');
    expect(playerAfter.teamId).toBe(otherTeam.id);
    expect(playerAfter.name).toBe('Joined Player');
    expect(store.authenticate('player@oakdale.local', 'PlayerTest2026')).not.toBeNull();
    expect(store.authenticate('player@oakdale.local', 'WouldClobberPassword')).toBeNull();
  });

  it('creates only the missing demo account and leaves an existing one unchanged', () => {
    const store = new LeagueStore(null);
    store.registerUser({
      email: 'manager@oakdale.local',
      name: 'Existing Mgr',
      password: 'existing-password',
      role: 'player',
      teamId: null,
    });

    const result = seedDemoUsers(store, demoOpts);
    expect(result.managerCreated).toBe(false);
    expect(result.playerCreated).toBe(true);

    const manager = store.getUserByEmail('manager@oakdale.local')!;
    expect(manager.role).toBe('player');
    expect(manager.teamId).toBeNull();
    expect(manager.name).toBe('Existing Mgr');
    expect(store.authenticate('manager@oakdale.local', 'existing-password')).not.toBeNull();
    expect(store.authenticate('manager@oakdale.local', 'ManagerTest2026')).toBeNull();

    const player = store.getUserByEmail('player@oakdale.local')!;
    expect(player.role).toBe('player');
    expect(player.teamId).toBeNull();
  });
});

describe('LeagueStore SQLite persistence and JSON import', () => {
  it('persists data across LeagueStore instances on the same file DB', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oakdale-sqlite-persist-'));
    try {
      const store = new LeagueStore(dir);
      const team = store.createTeam('Night Owls');
      store.addPlayer({ teamId: team.id, name: 'Sam', number: 9, position: 'P' });
      store.registerUser({ email: 'sam@oakdale.local', name: 'Sam', password: 'longenough' });
      store.setRules('Persisted rules');
      store.close();

      expect(existsSync(join(dir, 'league.db'))).toBe(true);

      const reopened = new LeagueStore(dir);
      expect(reopened.getTeam(team.id)?.name).toBe('Night Owls');
      expect(reopened.getRoster(team.id)).toEqual([
        expect.objectContaining({ name: 'Sam', number: 9, position: 'P' }),
      ]);
      expect(reopened.getUserByEmail('sam@oakdale.local')?.name).toBe('Sam');
      expect(reopened.getRules()).toBe('Persisted rules');
      expect(reopened.getTeams().map((t) => t.name)).toContain('Nothin but Dingers');
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('imports a legacy league.json into SQLite and backfills captain/member roles', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oakdale-sqlite-import-'));
    const jsonPath = join(dir, 'league.json');
    writeFileSync(
      jsonPath,
      JSON.stringify({
        teams: [{ id: 'legacy-squad', name: 'Legacy Squad' }],
        players: [{ id: 'p-1', teamId: 'legacy-squad', name: 'Imported Player', number: 3, position: 'SS' }],
        games: [
          {
            id: 'g-1',
            date: '2026-05-06',
            homeTeamId: 'legacy-squad',
            awayTeamId: 'legacy-squad',
            homeScore: 4,
            awayScore: 2,
            played: true,
            field: 'Field 1',
            time: '6:00 PM',
            location: 'Kerr Park',
            week: 1,
          },
        ],
        users: [
          {
            id: 'u-cap',
            email: 'legacy.cap@oakdale.local',
            name: 'Old Captain',
            role: 'captain',
            teamId: 'legacy-squad',
            passwordHash: 'scrypt$00$00',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'u-mem',
            email: 'legacy.mem@oakdale.local',
            name: 'Old Member',
            role: 'member',
            teamId: null,
            passwordHash: 'scrypt$imported',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        rules: 'Imported league rules stay intact',
        pendingManagers: [{ email: 'soon@oakdale.local', teamId: 'legacy-squad' }],
      }),
    );

    try {
      const store = new LeagueStore(jsonPath);
      expect(store.getTeams()).toEqual([{ id: 'legacy-squad', name: 'Legacy Squad' }]);
      expect(store.getRoster('legacy-squad')[0]).toMatchObject({ name: 'Imported Player', number: 3 });
      expect(store.getUserByEmail('legacy.cap@oakdale.local')?.role).toBe('manager');
      expect(store.getUserByEmail('legacy.cap@oakdale.local')?.teamId).toBe('legacy-squad');
      expect(store.getUserByEmail('legacy.mem@oakdale.local')?.role).toBe('player');
      expect(store.getUserByEmail('legacy.mem@oakdale.local')?.passwordHash).toBe('scrypt$imported');
      expect(store.getRules()).toBe('Imported league rules stay intact');
      expect(store.listManagerAuthorizations()).toEqual([
        expect.objectContaining({
          email: 'soon@oakdale.local',
          teamId: 'legacy-squad',
          status: 'pending',
        }),
        expect.objectContaining({
          email: 'legacy.cap@oakdale.local',
          teamId: 'legacy-squad',
          status: 'active',
        }),
      ]);
      expect(existsSync(join(dir, 'league.json.imported'))).toBe(true);
      expect(existsSync(jsonPath)).toBe(false);
      expect(existsSync(join(dir, 'league.db'))).toBe(true);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Player team membership', () => {
  it('lets a player self-join and leave; roster members are public-safe', async () => {
    const { app } = makeApp();
    const player = request.agent(app);
    const reg = await player
      .post('/api/auth/register')
      .send({ email: 'p@b.com', name: 'Pat', password: 'longenough' });
    expect(reg.status).toBe(201);

    await player.put('/api/auth/profile').send({
      name: 'Pat Shortstop',
      position: 'SS',
      number: 12,
      photoUrl: TINY_PNG,
    });

    const join = await player.put('/api/auth/team').send({ teamId: TEAM_OWN });
    expect(join.status).toBe(200);
    expect(join.body.teamId).toBe(TEAM_OWN);
    expect(join.body.role).toBe('player');
    expect(join.body.passwordHash).toBeUndefined();

    const roster = await request(app).get(`/api/teams/${TEAM_OWN}/roster`);
    expect(roster.status).toBe(200);
    expect(Array.isArray(roster.body.roster)).toBe(true);
    expect(roster.body.members).toHaveLength(1);
    const member = roster.body.members[0];
    expect(member).toMatchObject({
      id: join.body.id,
      name: 'Pat Shortstop',
      number: 12,
      position: 'SS',
      photoUrl: TINY_PNG,
    });
    expect(member.email).toBeUndefined();
    expect(member.passwordHash).toBeUndefined();
    expect('email' in member).toBe(false);
    expect('passwordHash' in member).toBe(false);

    const leave = await player.put('/api/auth/team').send({ teamId: null });
    expect(leave.status).toBe(200);
    expect(leave.body.teamId).toBeNull();

    const after = await request(app).get(`/api/teams/${TEAM_OWN}/roster`);
    expect(after.body.members).toHaveLength(0);
  });

  it('rejects self-join from a manager or admin', async () => {
    const { app, store } = makeApp();
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const adminJoin = await admin.put('/api/auth/team').send({ teamId: TEAM_OWN });
    expect(adminJoin.status).toBe(400);
    expect(adminJoin.body.error).toMatch(/managed by the league/i);

    store.registerUser({ email: 'mgr@b.com', name: 'Mgr', password: 'longenough' });
    store.setUserRole(store.getUserByEmail('mgr@b.com')!.id, 'manager', TEAM_OWN);
    const manager = await loginAs(app, 'mgr@b.com', 'longenough');
    const mgrJoin = await manager.put('/api/auth/team').send({ teamId: TEAM_OTHER });
    expect(mgrJoin.status).toBe(400);
    expect(mgrJoin.body.error).toMatch(/managed by the league/i);
  });

  it('lets an admin assign a player to any team and clear it', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'p@b.com', name: 'Pat', password: 'longenough' });
    const playerId = store.getUserByEmail('p@b.com')!.id;
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');

    const assign = await admin.post(`/api/users/${playerId}/team`).send({ teamId: TEAM_OTHER });
    expect(assign.status).toBe(200);
    expect(assign.body.teamId).toBe(TEAM_OTHER);
    expect(assign.body.passwordHash).toBeUndefined();

    const roster = await request(app).get(`/api/teams/${TEAM_OTHER}/roster`);
    expect(roster.body.members.some((m: { id: string }) => m.id === playerId)).toBe(true);

    const other = await admin.post(`/api/users/${playerId}/team`).send({ teamId: TEAM_OWN });
    expect(other.status).toBe(200);
    expect(other.body.teamId).toBe(TEAM_OWN);

    const clear = await admin.post(`/api/users/${playerId}/team`).send({ teamId: null });
    expect(clear.status).toBe(200);
    expect(clear.body.teamId).toBeNull();
  });

  it('lets a manager assign and remove only on their own team', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'a@b.com', name: 'Amy', password: 'longenough' });
    store.registerUser({ email: 'b@b.com', name: 'Ben', password: 'longenough' });
    const amy = store.getUserByEmail('a@b.com')!;
    const ben = store.getUserByEmail('b@b.com')!;
    store.registerUser({ email: 'mgr@b.com', name: 'Mgr', password: 'longenough' });
    store.setUserRole(store.getUserByEmail('mgr@b.com')!.id, 'manager', TEAM_OWN);

    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    await admin.post(`/api/users/${ben.id}/team`).send({ teamId: TEAM_OTHER });

    const manager = await loginAs(app, 'mgr@b.com', 'longenough');

    const own = await manager.post(`/api/users/${amy.id}/team`).send({ teamId: TEAM_OWN });
    expect(own.status).toBe(200);
    expect(own.body.teamId).toBe(TEAM_OWN);

    const other = await manager.post(`/api/users/${amy.id}/team`).send({ teamId: TEAM_OTHER });
    expect(other.status).toBe(403);

    const removeOwn = await manager.post(`/api/users/${amy.id}/team`).send({ teamId: null });
    expect(removeOwn.status).toBe(200);
    expect(removeOwn.body.teamId).toBeNull();

    const removeOther = await manager.post(`/api/users/${ben.id}/team`).send({ teamId: null });
    expect(removeOther.status).toBe(403);
  });

  it('rejects assigning a non-player and anonymous assignment', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'mgr@b.com', name: 'Mgr', password: 'longenough' });
    const managerId = store.setUserRole(store.getUserByEmail('mgr@b.com')!.id, 'manager', TEAM_OWN).id;
    const adminId = store.getUserByEmail('admin@oakdale.local')!.id;

    const anon = await request(app).post(`/api/users/${adminId}/team`).send({ teamId: TEAM_OWN });
    expect(anon.status).toBe(401);

    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const asAdmin = await admin.post(`/api/users/${adminId}/team`).send({ teamId: TEAM_OWN });
    expect([400, 403]).toContain(asAdmin.status);

    const asManager = await admin.post(`/api/users/${managerId}/team`).send({ teamId: TEAM_OWN });
    expect([400, 403]).toContain(asManager.status);
  });

  it('lists player accounts for admin/manager and blocks players and anonymous callers', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'p@b.com', name: 'Pat Player', password: 'longenough' });
    store.registerUser({ email: 'mgr@b.com', name: 'Mgr', password: 'longenough' });
    store.setUserRole(store.getUserByEmail('mgr@b.com')!.id, 'manager', TEAM_OWN);

    const anon = await request(app).get('/api/members');
    expect(anon.status).toBe(401);

    const player = await loginAs(app, 'p@b.com', 'longenough');
    const playerList = await player.get('/api/members');
    expect(playerList.status).toBe(403);

    const manager = await loginAs(app, 'mgr@b.com', 'longenough');
    const managerList = await manager.get('/api/members');
    expect(managerList.status).toBe(200);
    expect(Array.isArray(managerList.body)).toBe(true);
    expect(managerList.body.some((m: { name: string }) => m.name === 'Pat Player')).toBe(true);
    for (const row of managerList.body) {
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('name');
      expect(row).toHaveProperty('teamId');
      expect(row.email).toBeUndefined();
      expect('email' in row).toBe(false);
    }

    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const adminList = await admin.get('/api/members');
    expect(adminList.status).toBe(200);
  });
});

describe('Manager email authorizations', () => {
  it('queues an unknown email as pending, then auto-grants manager on register', async () => {
    const { app } = makeApp();
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');

    const post = await admin
      .post('/api/manager-emails')
      .send({ emails: 'NewMgr@oakdale.local', teamId: TEAM_OTHER });
    expect(post.status).toBe(200);
    expect(post.body.pending).toEqual(['newmgr@oakdale.local']);
    expect(post.body.promoted).toEqual([]);

    const listed = await admin.get('/api/manager-emails');
    expect(listed.status).toBe(200);
    const pendingRow = listed.body.find((r: { email: string }) => r.email === 'newmgr@oakdale.local');
    expect(pendingRow).toMatchObject({
      email: 'newmgr@oakdale.local',
      teamId: TEAM_OTHER,
      teamName: 'Da Beers',
      status: 'pending',
    });

    const agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send({
      email: 'NewMgr@oakdale.local',
      name: 'New Manager',
      password: 'longenough',
    });
    expect(reg.status).toBe(201);
    expect(reg.body.role).toBe('manager');
    expect(reg.body.teamId).toBe(TEAM_OTHER);
    expect(reg.body.email).toBe('newmgr@oakdale.local');

    const after = await admin.get('/api/manager-emails');
    const row = after.body.find((r: { email: string }) => r.email === 'newmgr@oakdale.local');
    expect(row).toMatchObject({ status: 'active', teamId: TEAM_OTHER });
    expect(
      after.body.some(
        (r: { email: string; status: string }) => r.email === 'newmgr@oakdale.local' && r.status === 'pending',
      ),
    ).toBe(false);
  });

  it('promotes an existing account immediately to active manager', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'already@oakdale.local', name: 'Already', password: 'longenough' });
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');

    const post = await admin
      .post('/api/manager-emails')
      .send({ emails: 'already@oakdale.local', teamId: TEAM_OWN });
    expect(post.status).toBe(200);
    expect(post.body.promoted).toEqual(['already@oakdale.local']);
    expect(post.body.pending).toEqual([]);

    const user = store.getUserByEmail('already@oakdale.local')!;
    expect(user.role).toBe('manager');
    expect(user.teamId).toBe(TEAM_OWN);

    const listed = await admin.get('/api/manager-emails');
    const row = listed.body.find((r: { email: string }) => r.email === 'already@oakdale.local');
    expect(row).toMatchObject({ status: 'active', teamId: TEAM_OWN, teamName: 'Nothin but Dingers' });
  });

  it('processes multiple emails in one request', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'one@oakdale.local', name: 'One', password: 'longenough' });
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');

    const post = await admin.post('/api/manager-emails').send({
      emails: 'one@oakdale.local, two@oakdale.local\nthree@oakdale.local',
      teamId: TEAM_OTHER,
    });
    expect(post.status).toBe(200);
    expect(post.body.promoted).toEqual(['one@oakdale.local']);
    expect(post.body.pending.sort()).toEqual(['three@oakdale.local', 'two@oakdale.local']);

    const listed = await admin.get('/api/manager-emails');
    const emails = listed.body
      .filter((r: { email: string }) =>
        ['one@oakdale.local', 'two@oakdale.local', 'three@oakdale.local'].includes(r.email),
      )
      .map((r: { email: string; status: string }) => `${r.email}:${r.status}`)
      .sort();
    expect(emails).toEqual([
      'one@oakdale.local:active',
      'three@oakdale.local:pending',
      'two@oakdale.local:pending',
    ]);
  });

  it('DELETE removes a pending entry and demotes an active manager while keeping teamId', async () => {
    const { app, store } = makeApp();
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');

    await admin.post('/api/manager-emails').send({ emails: 'pending@oakdale.local', teamId: TEAM_OTHER });
    const dropPending = await admin.delete('/api/manager-emails/pending%40oakdale.local');
    expect(dropPending.status).toBe(200);
    expect(dropPending.body.ok).toBe(true);
    const afterPending = await admin.get('/api/manager-emails');
    expect(afterPending.body.some((r: { email: string }) => r.email === 'pending@oakdale.local')).toBe(false);

    store.registerUser({ email: 'active.mgr@oakdale.local', name: 'Active', password: 'longenough' });
    await admin.post('/api/manager-emails').send({ emails: 'active.mgr@oakdale.local', teamId: TEAM_OWN });
    expect(store.getUserByEmail('active.mgr@oakdale.local')?.role).toBe('manager');
    expect(store.getUserByEmail('active.mgr@oakdale.local')?.teamId).toBe(TEAM_OWN);

    const dropActive = await admin.delete(`/api/manager-emails/${encodeURIComponent('active.mgr@oakdale.local')}`);
    expect(dropActive.status).toBe(200);
    const demoted = store.getUserByEmail('active.mgr@oakdale.local')!;
    expect(demoted.role).toBe('player');
    expect(demoted.teamId).toBe(TEAM_OWN);

    const afterActive = await admin.get('/api/manager-emails');
    expect(afterActive.body.some((r: { email: string }) => r.email === 'active.mgr@oakdale.local')).toBe(false);
  });

  it('restricts manager-emails endpoints to admins', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'mgr@b.com', name: 'Mgr', password: 'longenough' });
    store.setUserRole(store.getUserByEmail('mgr@b.com')!.id, 'manager', TEAM_OWN);

    const anonGet = await request(app).get('/api/manager-emails');
    expect(anonGet.status).toBe(401);
    const anonPost = await request(app).post('/api/manager-emails').send({ emails: 'x@y.com', teamId: TEAM_OWN });
    expect(anonPost.status).toBe(401);
    const anonDel = await request(app).delete('/api/manager-emails/x%40y.com');
    expect(anonDel.status).toBe(401);

    const player = request.agent(app);
    await player.post('/api/auth/register').send({ email: 'p@b.com', name: 'P', password: 'longenough' });
    expect((await player.get('/api/manager-emails')).status).toBe(403);
    expect((await player.post('/api/manager-emails').send({ emails: 'x@y.com', teamId: TEAM_OWN })).status).toBe(403);
    expect((await player.delete('/api/manager-emails/x%40y.com')).status).toBe(403);

    const manager = await loginAs(app, 'mgr@b.com', 'longenough');
    expect((await manager.get('/api/manager-emails')).status).toBe(403);
    expect((await manager.post('/api/manager-emails').send({ emails: 'x@y.com', teamId: TEAM_OWN })).status).toBe(403);
    expect((await manager.delete('/api/manager-emails/x%40y.com')).status).toBe(403);
  });

  it('includes the team manager on the roster with isManager true and no email', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'mgr@b.com', name: 'Mgr Player', password: 'longenough' });
    const mgr = store.getUserByEmail('mgr@b.com')!;
    store.setUserRole(mgr.id, 'manager', TEAM_OWN);
    store.updateProfile(mgr.id, { name: 'Mgr Player', position: 'P', number: 7 });

    store.registerUser({ email: 'p@b.com', name: 'Pat', password: 'longenough' });
    store.setUserTeam(store.getUserByEmail('p@b.com')!.id, TEAM_OWN);

    const roster = await request(app).get(`/api/teams/${TEAM_OWN}/roster`);
    expect(roster.status).toBe(200);
    expect(roster.body.manager).toEqual({ name: 'Mgr Player' });
    expect(roster.body.members).toHaveLength(2);
    const managerRow = roster.body.members[0];
    expect(managerRow).toMatchObject({
      id: mgr.id,
      name: 'Mgr Player',
      number: 7,
      position: 'P',
      isManager: true,
    });
    expect(managerRow.email).toBeUndefined();
    expect('email' in managerRow).toBe(false);
    expect(managerRow.passwordHash).toBeUndefined();
    expect(roster.body.members[1]).toMatchObject({ name: 'Pat', isManager: false });
  });
});

describe('Weekly check-in', () => {
  it('getCurrentWeek is week 1 before the season, that week on a game date, last week after, and null with no games', () => {
    const today = utcToday();

    const empty = makeApp().store;
    expect(empty.getCurrentWeek()).toBeNull();

    const before = makeApp().store;
    const opener = addUtcDays(today, 14);
    before.generateSchedule({ startDate: opener, weeks: 3 });
    expect(before.getCurrentWeek()).toEqual({ week: 1, date: opener });

    const onDate = makeApp().store;
    onDate.generateSchedule({ startDate: today, weeks: 3 });
    expect(onDate.getCurrentWeek()).toEqual({ week: 1, date: today });

    const mid = makeApp().store;
    mid.generateSchedule({ startDate: addUtcDays(today, -7), weeks: 3 });
    expect(mid.getCurrentWeek()).toEqual({ week: 2, date: today });

    const after = makeApp().store;
    after.generateSchedule({ startDate: addUtcDays(today, -28), weeks: 3 });
    const last = after.getCurrentWeek();
    expect(last?.week).toBe(3);
    expect(last?.date).toBe(addUtcDays(today, -14));
  });

  it('GET /api/current-week is public and returns the store result', async () => {
    const { app, store } = makeApp();
    const empty = await request(app).get('/api/current-week');
    expect(empty.status).toBe(200);
    expect(empty.body).toBeNull();

    store.generateSchedule({ startDate: utcToday(), weeks: 2 });
    const res = await request(app).get('/api/current-week');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(store.getCurrentWeek());
  });

  it('lets a player on a team set in/out and clear a check-in', () => {
    const { store } = makeApp();
    store.generateSchedule({ startDate: utcToday(), weeks: 3 });
    const player = store.registerUser({ email: 'p@b.com', name: 'Pat', password: 'longenough' });
    store.setUserTeam(player.id, TEAM_OWN);

    expect(store.setCheckIn(player.id, 1, 'in')).toBe('in');
    expect(store.getCheckInsForWeek(1).get(player.id)).toBe('in');
    expect(store.setCheckIn(player.id, 1, 'out')).toBe('out');
    expect(store.getCheckInsForWeek(1).get(player.id)).toBe('out');
    expect(store.setCheckIn(player.id, 1, null)).toBeNull();
    expect(store.getCheckInsForWeek(1).has(player.id)).toBe(false);
  });

  it('rejects check-in from a user with no team and an invalid week', () => {
    const { store } = makeApp();
    store.generateSchedule({ startDate: utcToday(), weeks: 3 });
    const admin = store.getUserByEmail('admin@oakdale.local')!;
    expect(admin.teamId).toBeNull();
    expect(() => store.setCheckIn(admin.id, 1, 'in')).toThrow(/on a team/i);

    const player = store.registerUser({ email: 'p@b.com', name: 'Pat', password: 'longenough' });
    expect(() => store.setCheckIn(player.id, 1, 'in')).toThrow(/on a team/i);

    store.setUserTeam(player.id, TEAM_OWN);
    expect(() => store.setCheckIn(player.id, 99, 'in')).toThrow(/scheduled week/i);
    expect(() => store.setCheckIn('missing-user', 1, 'in')).toThrow(/unknown user/i);
  });

  it('POST /api/checkin is 401 unauthenticated, 400 without a team or for a bad week', async () => {
    const { app, store } = makeApp();
    store.generateSchedule({ startDate: utcToday(), weeks: 3 });
    const current = store.getCurrentWeek()!;

    const anon = await request(app).post('/api/checkin').send({ week: current.week, status: 'in' });
    expect(anon.status).toBe(401);

    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const adminPost = await admin.post('/api/checkin').send({ week: current.week, status: 'in' });
    expect(adminPost.status).toBe(400);
    expect(adminPost.body.error).toMatch(/on a team/i);

    const player = request.agent(app);
    await player.post('/api/auth/register').send({ email: 'p@b.com', name: 'Pat', password: 'longenough' });
    const noTeam = await player.post('/api/checkin').send({ week: current.week, status: 'in' });
    expect(noTeam.status).toBe(400);

    await player.put('/api/auth/team').send({ teamId: TEAM_OWN });
    const badWeek = await player.post('/api/checkin').send({ week: 99, status: 'in' });
    expect(badWeek.status).toBe(400);

    const ok = await player.post('/api/checkin').send({ week: current.week, status: 'in' });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true, week: current.week, status: 'in' });

    const gone = await player.post('/api/checkin').send({ week: current.week, status: null });
    expect(gone.status).toBe(200);
    expect(gone.body).toEqual({ ok: true, week: current.week, status: null });
  });

  it('roster members reflect the current-week check-in and not other weeks', async () => {
    const { app, store } = makeApp();
    store.generateSchedule({ startDate: utcToday(), weeks: 3 });
    const current = store.getCurrentWeek()!;
    expect(current.week).toBe(1);

    const player = request.agent(app);
    const reg = await player
      .post('/api/auth/register')
      .send({ email: 'p@b.com', name: 'Pat', password: 'longenough' });
    await player.put('/api/auth/team').send({ teamId: TEAM_OWN });

    const otherWeek = current.week + 1;
    await player.post('/api/checkin').send({ week: otherWeek, status: 'out' });

    let roster = await request(app).get(`/api/teams/${TEAM_OWN}/roster`);
    expect(roster.status).toBe(200);
    expect(roster.body.currentWeek).toEqual(current);
    let member = roster.body.members.find((m: { id: string }) => m.id === reg.body.id);
    expect(member.checkIn).toBeNull();

    await player.post('/api/checkin').send({ week: current.week, status: 'in' });
    roster = await request(app).get(`/api/teams/${TEAM_OWN}/roster`);
    member = roster.body.members.find((m: { id: string }) => m.id === reg.body.id);
    expect(member.checkIn).toBe('in');

    await player.post('/api/checkin').send({ week: current.week, status: null });
    roster = await request(app).get(`/api/teams/${TEAM_OWN}/roster`);
    member = roster.body.members.find((m: { id: string }) => m.id === reg.body.id);
    expect(member.checkIn).toBeNull();
  });

  it('GET /api/schedule includes per-week home/away attendance for account members', async () => {
    const { app, store } = makeApp();
    store.generateSchedule({ startDate: utcToday(), weeks: 3 });

    const emptyTeam = TEAM_OTHER;
    const emptyGame = store.getSchedule().find((g) => g.homeTeamId === emptyTeam || g.awayTeamId === emptyTeam)!;
    expect(emptyGame).toBeDefined();
    expect(store.getTeamAttendance(emptyTeam, emptyGame.week)).toEqual({ in: 0, out: 0, none: 0, total: 0 });

    const manager = store.registerUser({
      email: 'mgr-att@b.com',
      name: 'Mgr Att',
      password: 'longenough',
      role: 'manager',
      teamId: TEAM_OWN,
    });
    const player = store.registerUser({ email: 'p-att@b.com', name: 'Pat Att', password: 'longenough' });
    store.setUserTeam(player.id, TEAM_OWN);

    store.setCheckIn(player.id, 1, 'in');
    store.setCheckIn(manager.id, 1, 'out');

    expect(store.getTeamAttendance(TEAM_OWN, 1)).toEqual({ in: 1, out: 1, none: 0, total: 2 });
    expect(store.getTeamAttendance(TEAM_OWN, 2)).toEqual({ in: 0, out: 0, none: 2, total: 2 });

    const res = await request(app).get('/api/schedule');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);

    type AttGame = {
      week: number;
      homeTeamId: string;
      awayTeamId: string;
      homeAttendance: { in: number; out: number; none: number; total: number };
      awayAttendance: { in: number; out: number; none: number; total: number };
    };
    const games = res.body as AttGame[];

    const week1 = games.filter((g) => g.week === 1 && (g.homeTeamId === TEAM_OWN || g.awayTeamId === TEAM_OWN));
    expect(week1.length).toBeGreaterThan(0);
    for (const game of week1) {
      const mine = game.homeTeamId === TEAM_OWN ? game.homeAttendance : game.awayAttendance;
      expect(mine).toEqual({ in: 1, out: 1, none: 0, total: 2 });
    }

    const week2 = games.filter((g) => g.week === 2 && (g.homeTeamId === TEAM_OWN || g.awayTeamId === TEAM_OWN));
    expect(week2.length).toBeGreaterThan(0);
    for (const game of week2) {
      const mine = game.homeTeamId === TEAM_OWN ? game.homeAttendance : game.awayAttendance;
      expect(mine).toEqual({ in: 0, out: 0, none: 2, total: 2 });
    }

    const emptyOnSchedule = games.find((g) => g.homeTeamId === emptyTeam || g.awayTeamId === emptyTeam)!;
    const emptyAtt =
      emptyOnSchedule.homeTeamId === emptyTeam
        ? emptyOnSchedule.homeAttendance
        : emptyOnSchedule.awayAttendance;
    expect(emptyAtt.total).toBe(0);
  });

  it('POST /api/schedule/generate returns attendance fields and remains public to GET', async () => {
    const { app } = makeApp();
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const gen = await admin.post('/api/schedule/generate').send({ startDate: utcToday(), weeks: 2 });
    expect(gen.status).toBe(201);
    expect(gen.body.length).toBeGreaterThan(0);
    for (const game of gen.body) {
      expect(game.homeAttendance).toEqual({ in: 0, out: 0, none: 0, total: 0 });
      expect(game.awayAttendance).toEqual({ in: 0, out: 0, none: 0, total: 0 });
    }

    const anon = await request(app).get('/api/schedule');
    expect(anon.status).toBe(200);
    expect(anon.body).toHaveLength(gen.body.length);
    expect(anon.body[0].homeAttendance).toBeDefined();
    expect(anon.body[0].awayAttendance).toBeDefined();
  });
});

describe('Suggestions', () => {
  it('lets anyone submit a suggestion and only admins list or delete them', async () => {
    const { app } = makeApp();

    const empty = await request(app).post('/api/suggestions').send({ text: '   ' });
    expect(empty.status).toBe(400);

    const created = await request(app)
      .post('/api/suggestions')
      .send({ text: '  Add a lights-out rule for weeknights.  ' });
    expect([200, 201]).toContain(created.status);
    expect(created.body.text).toBe('Add a lights-out rule for weeknights.');
    expect(created.body.authorName).toBeNull();
    expect(created.body.id).toBeTruthy();
    expect(created.body.createdAt).toBeTruthy();

    const named = await request(app)
      .post('/api/suggestions')
      .send({ text: 'More benches', name: '  Sam  ' });
    expect([200, 201]).toContain(named.status);
    expect(named.body.authorName).toBe('Sam');

    const player = request.agent(app);
    await player.post('/api/auth/register').send({
      email: 'suggester@b.com',
      name: 'Pat Player',
      password: 'longenough',
    });
    const asPlayer = await player.post('/api/suggestions').send({ text: 'Signed-in idea' });
    expect([200, 201]).toContain(asPlayer.status);
    expect(asPlayer.body.authorName).toBe('Pat Player');

    const anonGet = await request(app).get('/api/suggestions');
    expect(anonGet.status).toBe(401);

    const playerGet = await player.get('/api/suggestions');
    expect(playerGet.status).toBe(403);

    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const listed = await admin.get('/api/suggestions');
    expect(listed.status).toBe(200);
    expect(listed.body.map((s: { text: string }) => s.text)).toEqual([
      'Signed-in idea',
      'More benches',
      'Add a lights-out rule for weeknights.',
    ]);
    expect(listed.body[2].authorName).toBeNull();

    const remove = await admin.delete(`/api/suggestions/${created.body.id}`);
    expect(remove.status).toBe(200);
    expect(remove.body.ok).toBe(true);

    const after = await admin.get('/api/suggestions');
    expect(after.body.some((s: { id: string }) => s.id === created.body.id)).toBe(false);
    expect(after.body).toHaveLength(2);

    const playerDelete = await player.delete(`/api/suggestions/${named.body.id}`);
    expect(playerDelete.status).toBe(403);
    const anonDelete = await request(app).delete(`/api/suggestions/${named.body.id}`);
    expect(anonDelete.status).toBe(401);
  });
});

describe('Team group chat', () => {
  it('lets team members and admins post and read; blocks everyone else', async () => {
    const { app, store } = makeApp();

    store.registerUser({ email: 'own@b.com', name: 'Own Player', password: 'longenough' });
    store.setUserTeam(store.getUserByEmail('own@b.com')!.id, TEAM_OWN);
    store.registerUser({ email: 'other@b.com', name: 'Other Player', password: 'longenough' });
    store.setUserTeam(store.getUserByEmail('other@b.com')!.id, TEAM_OTHER);

    const anonGet = await request(app).get(`/api/teams/${TEAM_OWN}/messages`);
    expect(anonGet.status).toBe(401);
    const anonPost = await request(app).post(`/api/teams/${TEAM_OWN}/messages`).send({ text: 'hi' });
    expect(anonPost.status).toBe(401);

    const member = await loginAs(app, 'own@b.com', 'longenough');
    const empty = await member.post(`/api/teams/${TEAM_OWN}/messages`).send({ text: '   ' });
    expect(empty.status).toBe(400);

    const posted = await member.post(`/api/teams/${TEAM_OWN}/messages`).send({ text: '  See you at Kerr  ' });
    expect([200, 201]).toContain(posted.status);
    expect(posted.body.text).toBe('See you at Kerr');
    expect(posted.body.authorName).toBe('Own Player');
    expect(posted.body.userId).toBe(store.getUserByEmail('own@b.com')!.id);
    expect(posted.body.teamId).toBe(TEAM_OWN);

    const listed = await member.get(`/api/teams/${TEAM_OWN}/messages`);
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].text).toBe('See you at Kerr');
    expect(listed.body[0].authorName).toBe('Own Player');

    const outsider = await loginAs(app, 'other@b.com', 'longenough');
    const outsiderGet = await outsider.get(`/api/teams/${TEAM_OWN}/messages`);
    expect(outsiderGet.status).toBe(403);
    const outsiderPost = await outsider.post(`/api/teams/${TEAM_OWN}/messages`).send({ text: 'intruder' });
    expect(outsiderPost.status).toBe(403);

    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const adminGet = await admin.get(`/api/teams/${TEAM_OWN}/messages`);
    expect(adminGet.status).toBe(200);
    expect(adminGet.body).toHaveLength(1);
    const adminPost = await admin.post(`/api/teams/${TEAM_OTHER}/messages`).send({ text: 'Commissioner note' });
    expect([200, 201]).toContain(adminPost.status);
    expect(adminPost.body.authorName).toBe('Commish');
    const otherTeam = await admin.get(`/api/teams/${TEAM_OTHER}/messages`);
    expect(otherTeam.status).toBe(200);
    expect(otherTeam.body.map((m: { text: string }) => m.text)).toEqual(['Commissioner note']);

    const missing = await admin.get('/api/teams/no-such-team/messages');
    expect(missing.status).toBe(404);
    const missingPost = await admin.post('/api/teams/no-such-team/messages').send({ text: 'ghost' });
    expect(missingPost.status).toBe(404);
  });
});

describe('Admin test data simulation', () => {
  it('generateTestData seeds 72 guests, check-ins, chat, and a W/L spread; clear wipes sim data only', () => {
    const store = new LeagueStore(null);
    store.ensureAdmin('admin@oakdale.local', 'Commish', 'admin-password');
    seedDemoUsers(store);
    store.generateSchedule({ startDate: '2026-05-06' });
    store.addSuggestion({ text: 'Keep this suggestion' });
    const rulesBefore = store.getRules();
    const landingBefore = store.getLanding();
    const teamIds = store.getTeams().map((t) => t.id);

    const first = store.generateTestData();
    expect(first.alreadySeeded).toBe(false);
    expect(first.guestsCreated).toBe(72);
    expect(first.checkIns).toBe(72);
    expect(first.messages).toBeGreaterThanOrEqual(24);
    expect(first.messages).toBeLessThanOrEqual(40);
    expect(first.gamesPlayed).toBeGreaterThan(0);

    const guests = store
      .listUsers()
      .filter((u) => u.email.endsWith(SIM_EMAIL_DOMAIN))
      .sort((a, b) => Number(a.name.replace('Guest ', '')) - Number(b.name.replace('Guest ', '')));
    expect(guests).toHaveLength(72);
    expect(guests.every((u) => u.role === 'player')).toBe(true);
    expect(guests.map((u) => u.name)).toEqual(
      Array.from({ length: 72 }, (_, i) => `Guest ${i + 1}`),
    );
    expect(guests.map((u) => u.email)).toEqual(
      Array.from({ length: 72 }, (_, i) => `guest${i + 1}${SIM_EMAIL_DOMAIN}`),
    );

    const teams = store.getTeams();
    expect(teams).toHaveLength(8);
    for (let i = 0; i < teams.length; i++) {
      const onTeam = guests.filter((g) => g.teamId === teams[i].id);
      expect(onTeam).toHaveLength(9);
      const members = store.getTeamMembers(teams[i].id);
      const guestMembers = members.filter((m) => m.name.startsWith('Guest '));
      expect(guestMembers).toHaveLength(9);
      expect(guestMembers.every((m) => m.checkIn === 'in' || m.checkIn === 'out')).toBe(true);
      const messages = store.getTeamMessages(teams[i].id);
      expect(messages.length).toBeGreaterThanOrEqual(3);
      expect(messages.length).toBeLessThanOrEqual(5);
    }

    const current = store.getCurrentWeek();
    expect(current).not.toBeNull();
    const checkIns = store.getCheckInsForWeek(current!.week);
    expect(checkIns.size).toBeGreaterThanOrEqual(72);
    let inn = 0;
    let out = 0;
    for (const guest of guests) {
      const status = checkIns.get(guest.id);
      if (status === 'in') inn += 1;
      else if (status === 'out') out += 1;
    }
    expect(inn + out).toBe(72);
    expect(inn).toBe(54);
    expect(out).toBe(18);

    const standings = store.getStandings();
    expect(standings.every((row) => row.gamesPlayed > 0)).toBe(true);
    expect(standings.some((row) => row.wins > 0)).toBe(true);
    expect(standings.some((row) => row.losses > 0)).toBe(true);
    const winCounts = new Set(standings.map((row) => row.wins));
    expect(winCounts.size).toBeGreaterThan(1);

    const again = store.generateTestData();
    expect(again.alreadySeeded).toBe(true);
    expect(again.guestsCreated).toBe(0);
    expect(store.listUsers().filter((u) => u.email.endsWith(SIM_EMAIL_DOMAIN))).toHaveLength(72);

    const cleared = store.clearTestData();
    expect(cleared.guestsRemoved).toBe(72);
    expect(cleared.checkInsRemoved).toBe(72);
    expect(cleared.messagesRemoved).toBe(first.messages);
    expect(cleared.gamesReset).toBe(first.gamesPlayed);

    expect(store.listUsers().filter((u) => u.email.endsWith(SIM_EMAIL_DOMAIN))).toHaveLength(0);
    expect(store.getUserByEmail('admin@oakdale.local')?.role).toBe('admin');
    expect(store.getUserByEmail('manager@oakdale.local')?.role).toBe('manager');
    expect(store.getUserByEmail('player@oakdale.local')?.role).toBe('player');
    expect(store.getTeams().map((t) => t.id)).toEqual(teamIds);
    expect(store.getRules()).toBe(rulesBefore);
    expect(store.getLanding().headline).toBe(landingBefore.headline);
    expect(store.listSuggestions()).toHaveLength(1);
    expect(store.listSuggestions()[0].text).toBe('Keep this suggestion');
    for (const team of store.getTeams()) {
      expect(store.getTeamMessages(team.id)).toHaveLength(0);
    }
    for (const row of store.getStandings()) {
      expect(row.wins).toBe(0);
      expect(row.losses).toBe(0);
      expect(row.ties).toBe(0);
      expect(row.gamesPlayed).toBe(0);
    }
    expect(store.getSchedule().every((g) => g.played === false && g.homeScore === null && g.awayScore === null)).toBe(
      true,
    );
  });

  it('restricts test-data endpoints to admins (player/manager 403, anon 401)', async () => {
    const { app, store } = makeApp();
    seedDemoUsers(store);
    store.generateSchedule({ startDate: '2026-05-06' });
    store.registerUser({ email: 'mgr@b.com', name: 'Mgr', password: 'longenough' });
    store.setUserRole(store.getUserByEmail('mgr@b.com')!.id, 'manager', TEAM_OWN);
    store.registerUser({ email: 'p@b.com', name: 'P', password: 'longenough' });
    store.setUserTeam(store.getUserByEmail('p@b.com')!.id, TEAM_OWN);

    const anonGen = await request(app).post('/api/admin/test-data/generate');
    expect(anonGen.status).toBe(401);
    const anonClear = await request(app).post('/api/admin/test-data/clear');
    expect(anonClear.status).toBe(401);

    const player = await loginAs(app, 'p@b.com', 'longenough');
    expect((await player.post('/api/admin/test-data/generate')).status).toBe(403);
    expect((await player.post('/api/admin/test-data/clear')).status).toBe(403);

    const manager = await loginAs(app, 'mgr@b.com', 'longenough');
    expect((await manager.post('/api/admin/test-data/generate')).status).toBe(403);
    expect((await manager.post('/api/admin/test-data/clear')).status).toBe(403);

    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const generated = await admin.post('/api/admin/test-data/generate');
    expect(generated.status).toBe(200);
    expect(generated.body.guestsCreated).toBe(72);
    expect(generated.body.gamesPlayed).toBeGreaterThan(0);

    const dup = await admin.post('/api/admin/test-data/generate');
    expect(dup.status).toBe(409);
    expect(dup.body.alreadySeeded).toBe(true);

    const roster = await request(app).get(`/api/teams/${store.getTeams()[0].id}/roster`);
    expect(roster.status).toBe(200);
    expect(roster.body.members.filter((m: { name: string }) => m.name.startsWith('Guest '))).toHaveLength(9);

    const standings = await request(app).get('/api/standings');
    expect(standings.body.some((row: { gamesPlayed: number }) => row.gamesPlayed > 0)).toBe(true);

    const cleared = await admin.post('/api/admin/test-data/clear');
    expect(cleared.status).toBe(200);
    expect(cleared.body.guestsRemoved).toBe(72);
    const after = await request(app).get('/api/standings');
    expect(after.body.every((row: { gamesPlayed: number }) => row.gamesPlayed === 0)).toBe(true);
  });
});

