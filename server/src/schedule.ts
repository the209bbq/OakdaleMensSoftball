import type { Game, Team } from './types.js';

const BYE = '__bye__';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface GenerateOptions {
  /** ISO date (YYYY-MM-DD) of the season opener. Defaults to next Saturday. */
  startDate?: string;
}

/** Return the next Saturday (or today if today is Saturday) as YYYY-MM-DD. */
export function nextSaturday(from: Date = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const day = d.getUTCDay();
  const delta = (6 - day + 7) % 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function addWeeks(isoDate: string, weeks: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return new Date(d.getTime() + weeks * WEEK_MS).toISOString().slice(0, 10);
}

/**
 * Build a single round-robin season schedule from the given teams using the
 * circle method: every team plays every other team exactly once. The first
 * round is the season opener. Home/away alternates by round for fairness, and
 * an odd number of teams introduces a bye each round.
 */
export function generateRoundRobin(teams: Team[], options: GenerateOptions = {}): Game[] {
  const startDate = options.startDate ?? nextSaturday();
  if (teams.length < 2) return [];

  const ids = teams.map((t) => t.id);
  if (ids.length % 2 !== 0) ids.push(BYE);

  const n = ids.length;
  const rounds = n - 1;
  const half = n / 2;
  const rotation = [...ids];
  const games: Game[] = [];
  let gameSeq = 1;

  for (let round = 0; round < rounds; round++) {
    const date = addWeeks(startDate, round);
    for (let i = 0; i < half; i++) {
      const a = rotation[i];
      const b = rotation[n - 1 - i];
      if (a === BYE || b === BYE) continue;
      // Alternate home/away by round so no team is always the home team.
      const [homeTeamId, awayTeamId] = round % 2 === 0 ? [a, b] : [b, a];
      games.push({
        id: `g${gameSeq++}`,
        date,
        homeTeamId,
        awayTeamId,
        homeScore: null,
        awayScore: null,
        played: false,
      });
    }

    // Rotate all but the first element clockwise.
    const last = rotation.splice(n - 1, 1)[0];
    rotation.splice(1, 0, last);
  }

  return games;
}
