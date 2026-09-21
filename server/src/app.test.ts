import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
