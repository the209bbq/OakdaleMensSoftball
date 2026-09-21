import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FIELDS,
  DEFAULT_LOCATION,
  EARLY_TIME,
  LATE_TIME,
  generateRoundRobin,
  nextWednesday,
} from './schedule.js';
import type { Team } from './types.js';

const teams = (n: number): Team[] =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, name: `Team ${i + 1}` }));

describe('generateRoundRobin', () => {
  it('creates 11 Wednesday-night weeks for 8 teams (44 games) with field/time/location/week', () => {
    const games = generateRoundRobin(teams(8), { startDate: '2026-05-06', weeks: 11 });
    expect(games).toHaveLength(44);

    for (const g of games) {
      expect(DEFAULT_FIELDS).toContain(g.field);
      expect([EARLY_TIME, LATE_TIME]).toContain(g.time);
      expect(g.location).toBe(DEFAULT_LOCATION);
      expect(g.week).toBeGreaterThanOrEqual(1);
      expect(g.week).toBeLessThanOrEqual(11);
    }

    const plays = new Map<string, number>();
    for (const g of games) {
      plays.set(g.homeTeamId, (plays.get(g.homeTeamId) ?? 0) + 1);
      plays.set(g.awayTeamId, (plays.get(g.awayTeamId) ?? 0) + 1);
    }
    expect(plays.size).toBe(8);
    for (const count of plays.values()) {
      expect(count).toBe(11);
    }
  });

  it('slots four games in a week as F1/F2/F3 at 6:00 PM and F1 at 7:30 PM', () => {
    const games = generateRoundRobin(teams(8), { startDate: '2026-05-06', weeks: 11 });
    for (let week = 1; week <= 11; week++) {
      const weekGames = games.filter((g) => g.week === week);
      expect(weekGames).toHaveLength(4);
      expect(weekGames[0]).toMatchObject({ time: EARLY_TIME, field: 'Field 1' });
      expect(weekGames[1]).toMatchObject({ time: EARLY_TIME, field: 'Field 2' });
      expect(weekGames[2]).toMatchObject({ time: EARLY_TIME, field: 'Field 3' });
      expect(weekGames[3]).toMatchObject({ time: LATE_TIME, field: 'Field 1' });
    }
  });

  it('starts on the requested opener date with games one week apart', () => {
    const games = generateRoundRobin(teams(8), { startDate: '2026-05-06', weeks: 11 });
    const dates = [...new Set(games.map((g) => g.date))].sort();
    expect(dates).toHaveLength(11);
    expect(dates[0]).toBe('2026-05-06');
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(`${dates[i - 1]}T00:00:00Z`).getTime();
      const next = new Date(`${dates[i]}T00:00:00Z`).getTime();
      expect(next - prev).toBe(7 * 24 * 60 * 60 * 1000);
    }
    for (const g of games) {
      expect(g.date).toBe(dates[g.week - 1]);
    }
  });

  it('creates a full round-robin cycle for an even number of teams when weeks = n-1', () => {
    const games = generateRoundRobin(teams(4), { startDate: '2026-05-06', weeks: 3 });
    // 4 teams -> C(4,2) = 6 games total.
    expect(games).toHaveLength(6);

    const pairs = games.map((g) => [g.homeTeamId, g.awayTeamId].sort().join('-'));
    expect(new Set(pairs).size).toBe(6);
  });

  it('handles an odd number of teams with byes (no team plays twice per week)', () => {
    const games = generateRoundRobin(teams(5), { startDate: '2026-05-06', weeks: 5 });
    // 5 teams + bye -> 2 games per week × 5 weeks.
    expect(games).toHaveLength(10);

    const byWeek = new Map<number, string[]>();
    for (const g of games) {
      const teamsThisWeek = byWeek.get(g.week) ?? [];
      teamsThisWeek.push(g.homeTeamId, g.awayTeamId);
      byWeek.set(g.week, teamsThisWeek);
    }
    expect(byWeek.size).toBe(5);
    for (const involved of byWeek.values()) {
      expect(new Set(involved).size).toBe(involved.length);
      expect(involved.length).toBe(4);
    }
  });

  it('alternates home/away so no team is always home', () => {
    const games = generateRoundRobin(teams(4), { startDate: '2026-05-06', weeks: 3 });
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

  it('nextWednesday returns a Wednesday in YYYY-MM-DD form', () => {
    const iso = nextWednesday(new Date('2026-05-04T12:00:00Z')); // Monday
    expect(iso).toBe('2026-05-06');
    expect(new Date(`${iso}T00:00:00Z`).getUTCDay()).toBe(3);
    // Already Wednesday → that same day.
    expect(nextWednesday(new Date('2026-05-06T12:00:00Z'))).toBe('2026-05-06');
  });
});
