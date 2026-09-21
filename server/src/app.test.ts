import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { LeagueStore } from './store.js';

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

  it('lists four seeded teams without auth', async () => {
    const res = await request(app).get('/api/teams');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
  });

  it('computes standings from played games without auth', async () => {
    const res = await request(app).get('/api/standings');
    expect(res.status).toBe(200);
    expect(res.body[0].teamName).toBe('Oakdale Tigers');
    expect(res.body[0].wins).toBe(2);
  });

  it('returns a roster sorted by number', async () => {
    const res = await request(app).get('/api/teams/tigers/roster');
    expect(res.status).toBe(200);
    const numbers = res.body.roster.map((p: { number: number }) => p.number);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
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
    const res = await request(app).post('/api/players').send({ teamId: 'tigers', name: 'X', number: 1 });
    expect(res.status).toBe(401);
  });

  it('lets an admin add a player to any team', async () => {
    const { app } = makeApp();
    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const res = await admin
      .post('/api/players')
      .send({ teamId: 'aces', name: 'New Guy', number: 42, position: 'Outfield' });
    expect(res.status).toBe(201);
  });

  it('blocks a plain member from writing', async () => {
    const { app } = makeApp();
    const member = request.agent(app);
    await member.post('/api/auth/register').send({ email: 'm@b.com', name: 'M', password: 'longenough' });
    const res = await member.post('/api/players').send({ teamId: 'tigers', name: 'X', number: 1 });
    expect(res.status).toBe(403);
  });

  it('lets a captain manage only their own team', async () => {
    const { app, store } = makeApp();
    // Create a captain of the Tigers.
    store.registerUser({ email: 'cap@b.com', name: 'Cap', password: 'longenough' });
    const cap = store.getUserByEmail('cap@b.com')!;
    store.setUserRole(cap.id, 'captain', 'tigers');

    const captain = await loginAs(app, 'cap@b.com', 'longenough');

    const own = await captain.post('/api/players').send({ teamId: 'tigers', name: 'Rookie', number: 50 });
    expect(own.status).toBe(201);

    const other = await captain.post('/api/players').send({ teamId: 'aces', name: 'Nope', number: 51 });
    expect(other.status).toBe(403);
  });

  it('only lets admins generate the schedule', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'cap@b.com', name: 'Cap', password: 'longenough' });
    store.setUserRole(store.getUserByEmail('cap@b.com')!.id, 'captain', 'tigers');

    const captain = await loginAs(app, 'cap@b.com', 'longenough');
    const denied = await captain.post('/api/schedule/generate').send({ startDate: '2026-07-04' });
    expect(denied.status).toBe(403);

    const admin = await loginAs(app, 'admin@oakdale.local', 'admin-password');
    const ok = await admin.post('/api/schedule/generate').send({ startDate: '2026-07-04' });
    expect(ok.status).toBe(201);
    expect(ok.body).toHaveLength(6);
  });

  it('lets a captain report only their own games', async () => {
    const { app, store } = makeApp();
    store.registerUser({ email: 'cap@b.com', name: 'Cap', password: 'longenough' });
    store.setUserRole(store.getUserByEmail('cap@b.com')!.id, 'captain', 'tigers');
    const captain = await loginAs(app, 'cap@b.com', 'longenough');

    // g5: Aces (home) vs Tigers (away) -> captain of Tigers may report.
    const own = await captain.post('/api/games/g5/result').send({ homeScore: 3, awayScore: 9 });
    expect(own.status).toBe(200);

    // g6: Sluggers vs Bombers -> Tigers captain may not.
    const other = await captain.post('/api/games/g6/result').send({ homeScore: 1, awayScore: 2 });
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
      .send({ role: 'captain', teamId: 'bombers' });
    expect(assign.status).toBe(200);
    expect(assign.body.role).toBe('captain');
    expect(assign.body.teamId).toBe('bombers');

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
