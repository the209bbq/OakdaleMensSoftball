import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { LeagueStore } from './store.js';

function makeApp() {
  const store = new LeagueStore(null);
  return createApp(store);
}

describe('Oakdale Men\'s Softball API', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = makeApp();
  });

  it('reports health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('lists four seeded teams', async () => {
    const res = await request(app).get('/api/teams');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
  });

  it('computes standings from played games', async () => {
    const res = await request(app).get('/api/standings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
    // Tigers won both played games (8-5, 10-3) -> should be first.
    expect(res.body[0].teamName).toBe('Oakdale Tigers');
    expect(res.body[0].wins).toBe(2);
    const totalGamesPlayed = res.body.reduce(
      (sum: number, row: { gamesPlayed: number }) => sum + row.gamesPlayed,
      0,
    );
    // 4 played games in seed data, each counts for two teams.
    expect(totalGamesPlayed).toBe(8);
  });

  it('returns a team roster sorted by number', async () => {
    const res = await request(app).get('/api/teams/tigers/roster');
    expect(res.status).toBe(200);
    expect(res.body.team.name).toBe('Oakdale Tigers');
    const numbers = res.body.roster.map((p: { number: number }) => p.number);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });

  it('404s for an unknown team roster', async () => {
    const res = await request(app).get('/api/teams/nope/roster');
    expect(res.status).toBe(404);
  });

  it('adds a player to a team', async () => {
    const before = await request(app).get('/api/teams/aces/roster');
    const beforeCount = before.body.roster.length;

    const res = await request(app)
      .post('/api/players')
      .send({ teamId: 'aces', name: 'New Guy', number: 42, position: 'Outfield' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('New Guy');

    const after = await request(app).get('/api/teams/aces/roster');
    expect(after.body.roster.length).toBe(beforeCount + 1);
  });

  it('rejects a player with no name', async () => {
    const res = await request(app).post('/api/players').send({ teamId: 'aces', number: 1 });
    expect(res.status).toBe(400);
  });

  it('records a game result and updates standings', async () => {
    const res = await request(app)
      .post('/api/games/g5/result')
      .send({ homeScore: 3, awayScore: 9 });
    expect(res.status).toBe(200);
    expect(res.body.played).toBe(true);

    const standings = await request(app).get('/api/standings');
    const tigers = standings.body.find((r: { teamId: string }) => r.teamId === 'tigers');
    // Tigers were the away team in g5 and won 9-3, giving them a third win.
    expect(tigers.wins).toBe(3);
  });
});
