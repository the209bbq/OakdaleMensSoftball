import { describe, expect, it } from 'vitest';
import { generateRoundRobin, nextSaturday } from './schedule.js';
import type { Team } from './types.js';

const teams = (n: number): Team[] =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, name: `Team ${i + 1}` }));

describe('generateRoundRobin', () => {
  it('creates a single round-robin for an even number of teams', () => {
    const games = generateRoundRobin(teams(4), { startDate: '2026-05-02' });
    // 4 teams -> C(4,2) = 6 games total.
    expect(games).toHaveLength(6);

    // Every unordered pair appears exactly once.
    const pairs = games.map((g) => [g.homeTeamId, g.awayTeamId].sort().join('-'));
    expect(new Set(pairs).size).toBe(6);
  });

  it('starts on the requested opener date with games one week apart', () => {
    const games = generateRoundRobin(teams(4), { startDate: '2026-05-02' });
    const dates = [...new Set(games.map((g) => g.date))].sort();
    expect(dates[0]).toBe('2026-05-02');
    // 4 teams -> 3 rounds, one week apart.
    expect(dates).toEqual(['2026-05-02', '2026-05-09', '2026-05-16']);
  });

  it('handles an odd number of teams with byes (no team plays twice per week)', () => {
    const games = generateRoundRobin(teams(5), { startDate: '2026-06-06' });
    // 5 teams -> C(5,2) = 10 games.
    expect(games).toHaveLength(10);

    const byWeek = new Map<string, string[]>();
    for (const g of games) {
      const teamsThisWeek = byWeek.get(g.date) ?? [];
      teamsThisWeek.push(g.homeTeamId, g.awayTeamId);
      byWeek.set(g.date, teamsThisWeek);
    }
    for (const involved of byWeek.values()) {
      expect(new Set(involved).size).toBe(involved.length);
    }
  });

  it('alternates home/away so no team is always home', () => {
    const games = generateRoundRobin(teams(4), { startDate: '2026-05-02' });
    const homeCounts = new Map<string, number>();
    for (const g of games) {
      homeCounts.set(g.homeTeamId, (homeCounts.get(g.homeTeamId) ?? 0) + 1);
    }
    // With 4 teams each plays 3 games; no team should host all 3.
    for (const count of homeCounts.values()) {
      expect(count).toBeLessThan(3);
    }
  });

  it('returns no games for fewer than two teams', () => {
    expect(generateRoundRobin(teams(1))).toHaveLength(0);
    expect(generateRoundRobin([])).toHaveLength(0);
  });

  it('nextSaturday returns a Saturday in YYYY-MM-DD form', () => {
    const iso = nextSaturday(new Date('2026-05-04T12:00:00Z')); // Monday
    expect(iso).toBe('2026-05-09');
    expect(new Date(`${iso}T00:00:00Z`).getUTCDay()).toBe(6);
  });
});
