import type { StoredPlayResult } from './gameScoring.js';
import { TEAM_ROSTER_SPOTS } from './playerStatsSheet.js';
import type { SkillLevel, WaiverStatus } from './types.js';

/** Tiny 1×1 PNG used for simulated profile photos and waiver scans. */
export const SIM_TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Rostered guests created per team (matches the 15-spot roster). */
export const SIM_GUESTS_PER_TEAM = TEAM_ROSTER_SPOTS;

/** Unattached guests so free-agency, invites, and the stats sheet FA section have data. */
export const SIM_FREE_AGENT_COUNT = 8;

export const SIM_POSITIONS = [
  'P',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'LF',
  'CF',
  'RF',
  'DH',
  'UTIL',
  'LF',
  'RF',
  '2B',
  'SS',
] as const;

const SIM_FIRST_NAMES = [
  'Alex',
  'Blake',
  'Carlos',
  'Derek',
  'Eddie',
  'Felix',
  'Gabe',
  'Hector',
  'Ivan',
  'Jose',
  'Kyle',
  'Luis',
  'Marco',
  'Nate',
  'Oscar',
  'Pete',
  'Quinn',
  'Rafael',
  'Sam',
  'Tyler',
  'Vince',
  'Will',
  'Xavier',
  'Yuri',
  'Andre',
  'Ben',
  'Chris',
  'Diego',
  'Eli',
  'Frank',
  'Greg',
  'Hank',
];

const SIM_LAST_NAMES = [
  'Rivera',
  'Nguyen',
  'Patel',
  'Garcia',
  'Brooks',
  'Chen',
  'Ortiz',
  'Walsh',
  'Kim',
  'Santos',
  'Reed',
  'Morales',
  'Hughes',
  'Diaz',
  'Foster',
  'Lane',
];

const SIM_SKILLS: SkillLevel[] = ['rec', 'regular', 'competitive'];

export function simGuestName(index: number): string {
  const i = Math.max(0, Math.trunc(index));
  const first = SIM_FIRST_NAMES[i % SIM_FIRST_NAMES.length];
  const last = SIM_LAST_NAMES[Math.floor(i / SIM_FIRST_NAMES.length) % SIM_LAST_NAMES.length];
  return `${first} ${last}`;
}

export function simPosition(slotOnTeam: number): string {
  return SIM_POSITIONS[((slotOnTeam % SIM_POSITIONS.length) + SIM_POSITIONS.length) % SIM_POSITIONS.length];
}

export function simSkill(index: number): SkillLevel {
  return SIM_SKILLS[((index % SIM_SKILLS.length) + SIM_SKILLS.length) % SIM_SKILLS.length];
}

export function simJersey(slotOnTeam: number): number {
  return (slotOnTeam % 99) + 1;
}

export function simPhone(index: number): string | null {
  if (index % 7 === 0) return null;
  const n = 1000 + (index % 8900);
  return `209-555-${String(n).padStart(4, '0')}`;
}

export function simSharePhone(index: number, phone: string | null): boolean {
  return Boolean(phone) && index % 2 === 0;
}

export function simPhotoUrl(index: number): string | undefined {
  return index % 3 === 0 ? SIM_TINY_PNG : undefined;
}

export function simWaiver(index: number): {
  waiverStatus: WaiverStatus;
  waiverUrl: string | null;
} {
  const bucket = index % 5;
  if (bucket === 0) return { waiverStatus: 'none', waiverUrl: null };
  if (bucket === 1) return { waiverStatus: 'pending', waiverUrl: SIM_TINY_PNG };
  if (bucket === 4) return { waiverStatus: 'rejected', waiverUrl: SIM_TINY_PNG };
  return { waiverStatus: 'approved', waiverUrl: SIM_TINY_PNG };
}

/** Rotate the batting 10 so bench players still see the field over an 11-week season. */
export function rotateLineup<T>(players: T[], week: number, size: number): T[] {
  if (players.length === 0 || size <= 0) return [];
  const start = ((Math.max(1, week) - 1) * 2) % players.length;
  return players.slice(start).concat(players.slice(0, start)).slice(0, Math.min(size, players.length));
}

export function pickSimHit(rng: () => number): StoredPlayResult {
  const roll = rng();
  if (roll < 0.08) return 'homer';
  if (roll < 0.16) return 'triple';
  if (roll < 0.38) return 'double';
  return 'single';
}

export function pickSimOut(rng: () => number): StoredPlayResult {
  return rng() < 0.32 ? 'strikeout' : 'out';
}
