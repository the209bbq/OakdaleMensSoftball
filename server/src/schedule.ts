import type { Game, Team } from './types.js';

const BYE = '__bye__';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const DEFAULT_LOCATION = 'Kerr Park';
export const DEFAULT_WEEKS = 11;
export const DEFAULT_FIELDS = ['Field 1', 'Field 2', 'Field 3'] as const;
export const EARLY_TIME = '6:00 PM';
export const LATE_TIME = '7:30 PM';

export interface GenerateOptions {
  /** ISO date (YYYY-MM-DD) of the season opener. Defaults to next Wednesday. */
  startDate?: string;
  /** Regular-season weeks (one round per week). Defaults to 11. */
  weeks?: number;
  location?: string;
  fields?: readonly string[];
  earlyTime?: string;
  lateTime?: string;
}

/** Return the next Wednesday (or today if today is Wednesday) as YYYY-MM-DD. */
export function nextWednesday(from: Date = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const day = d.getUTCDay();
  const delta = (3 - day + 7) % 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function addWeeks(isoDate: string, weeks: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return new Date(d.getTime() + weeks * WEEK_MS).toISOString().slice(0, 10);
}

function slotTime(wave: number, earlyTime: string, lateTime: string): string {
  return wave === 0 ? earlyTime : lateTime;
}

/**
 * Build a regular-season schedule from the given teams using the circle method.
 * One round per week for `weeks` weeks (default 11). For 8 teams a full
 * round-robin is 7 rounds; weeks 8–11 continue the rotation and repeat earlier
 * pairings, swapping home/away on the next cycle for fairness. Odd team counts
 * introduce a bye each round (bye games are skipped).
 *
 * Within a week, matchups are slotted across fields in waves: the first wave
 * is the early time, later waves use the late time.
 *
 * TODO: playoffs bracket seeded from final standings after the 11-week regular season
 */
export function generateRoundRobin(teams: Team[], options: GenerateOptions = {}): Game[] {
  const startDate = options.startDate ?? nextWednesday();
  const weeks = options.weeks ?? DEFAULT_WEEKS;
  const location = options.location ?? DEFAULT_LOCATION;
  const fields = options.fields ?? DEFAULT_FIELDS;
  const earlyTime = options.earlyTime ?? EARLY_TIME;
  const lateTime = options.lateTime ?? LATE_TIME;

  if (teams.length < 2) return [];

  const ids = teams.map((t) => t.id);
  if (ids.length % 2 !== 0) ids.push(BYE);

  const n = ids.length;
  const half = n / 2;
  const rotation = [...ids];
  const games: Game[] = [];
  let gameSeq = 1;

  for (let round = 0; round < weeks; round++) {
    const date = addWeeks(startDate, round);
    const week = round + 1;
    let slot = 0;
    for (let i = 0; i < half; i++) {
      const a = rotation[i];
      const b = rotation[n - 1 - i];
      if (a === BYE || b === BYE) continue;
      // Alternate home/away by round so no team is always the home team.
      // Because a full cycle is an odd number of rounds, repeated pairings
      // on the next cycle swap home/away automatically.
      const [homeTeamId, awayTeamId] = round % 2 === 0 ? [a, b] : [b, a];
      const wave = Math.floor(slot / fields.length);
      games.push({
        id: `g${gameSeq++}`,
        date,
        homeTeamId,
        awayTeamId,
        homeScore: null,
        awayScore: null,
        played: false,
        field: fields[slot % fields.length],
        time: slotTime(wave, earlyTime, lateTime),
        location,
        week,
      });
      slot += 1;
    }

    // Rotate all but the first element clockwise.
    const last = rotation.splice(n - 1, 1)[0];
    rotation.splice(1, 0, last);
  }

  return games;
}
