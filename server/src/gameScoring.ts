/** Live scorekeeping windows: 2-hour games, plus 24 hours after the final out. */

export const GAME_DURATION_MS = 2 * 60 * 60 * 1000;
export const SCORING_GRACE_MS = 24 * 60 * 60 * 1000;
/** Managers may tap Start up to two hours before the scheduled first pitch. */
export const MANAGER_EARLY_START_MS = 2 * 60 * 60 * 1000;

export type ScoringPhase = 'upcoming' | 'live' | 'grace' | 'locked';
export type ScoreSide = 'home' | 'away';
export type ScoreStat = 'runs' | 'hits' | 'walks' | 'outs';

export interface ScoringWindow {
  phase: ScoringPhase;
  open: boolean;
  startMs: number | null;
  opensAt: string | null;
  liveEndsAt: string | null;
  closesAt: string | null;
}

export interface GameBoxScore {
  homeRuns: number;
  awayRuns: number;
  homeHits: number;
  awayHits: number;
  homeWalks: number;
  awayWalks: number;
  homeOuts: number;
  awayOuts: number;
  currentOuts: number;
}

/** Parse "6:00 PM" → 18:00, "7:30 PM" → 19:30, "18:00" → 18:00. */
export function parseGameClock(time: string): { hours: number; minutes: number } | null {
  const match = String(time ?? '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const ampm = match[3]?.toUpperCase();
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

/** Combine a YYYY-MM-DD date with a "6:00 PM"-style time into a naive local datetime. */
export function combineGameDateTime(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const clock = parseGameClock(time) ?? { hours: 0, minutes: 0 };
  const hh = String(clock.hours).padStart(2, '0');
  const mm = String(clock.minutes).padStart(2, '0');
  return `${date}T${hh}:${mm}:00`;
}

export function scheduledStartMs(date: string, time: string): number | null {
  const combined = combineGameDateTime(date, time);
  if (!combined) return null;
  const t = new Date(combined).getTime();
  return Number.isNaN(t) ? null : t;
}

function isoOrNull(ms: number | null): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * Scoring clock. `liveStartedAtMs` wins when a manager/admin has started the
 * game; otherwise the scheduled first-pitch time is used.
 */
export function scoringWindow(
  scheduledMs: number | null,
  liveStartedAtMs: number | null,
  nowMs: number,
): ScoringWindow {
  const startMs = liveStartedAtMs ?? scheduledMs;
  if (startMs == null) {
    return { phase: 'upcoming', open: false, startMs: null, opensAt: null, liveEndsAt: null, closesAt: null };
  }
  const liveEndsAtMs = startMs + GAME_DURATION_MS;
  const closesAtMs = liveEndsAtMs + SCORING_GRACE_MS;
  const base = {
    startMs,
    opensAt: isoOrNull(startMs),
    liveEndsAt: isoOrNull(liveEndsAtMs),
    closesAt: isoOrNull(closesAtMs),
  };
  if (nowMs < startMs) return { ...base, phase: 'upcoming', open: false };
  if (nowMs < liveEndsAtMs) return { ...base, phase: 'live', open: true };
  if (nowMs < closesAtMs) return { ...base, phase: 'grace', open: true };
  return { ...base, phase: 'locked', open: false };
}

/** Admin may always start. Managers may start from 2h before first pitch through the grace window. */
export function canStartLiveGame(
  scheduledMs: number | null,
  liveStartedAtMs: number | null,
  nowMs: number,
  isAdmin: boolean,
): boolean {
  if (liveStartedAtMs != null) return false;
  if (isAdmin) return true;
  if (scheduledMs == null) return true;
  const earliest = scheduledMs - MANAGER_EARLY_START_MS;
  const latest = scheduledMs + GAME_DURATION_MS + SCORING_GRACE_MS;
  return nowMs >= earliest && nowMs < latest;
}

export function clampStat(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.trunc(value);
}

/** Current half-inning outs stay in 0–2. */
export function wrapCurrentOuts(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const n = Math.trunc(value);
  if (n < 0) return 0;
  return n % 3;
}

export const EMPTY_BOX: GameBoxScore = {
  homeRuns: 0,
  awayRuns: 0,
  homeHits: 0,
  awayHits: 0,
  homeWalks: 0,
  awayWalks: 0,
  homeOuts: 0,
  awayOuts: 0,
  currentOuts: 0,
};

export function boxFromParts(
  homeRuns: number | null | undefined,
  awayRuns: number | null | undefined,
  log?: Partial<GameBoxScore> | null,
): GameBoxScore {
  return {
    homeRuns: clampStat(homeRuns ?? 0),
    awayRuns: clampStat(awayRuns ?? 0),
    homeHits: clampStat(log?.homeHits ?? 0),
    awayHits: clampStat(log?.awayHits ?? 0),
    homeWalks: clampStat(log?.homeWalks ?? 0),
    awayWalks: clampStat(log?.awayWalks ?? 0),
    homeOuts: clampStat(log?.homeOuts ?? 0),
    awayOuts: clampStat(log?.awayOuts ?? 0),
    currentOuts: wrapCurrentOuts(log?.currentOuts ?? 0),
  };
}

/** Admins may score any game. Managers only while the window is open. */
export function canScoreLiveGame(window: ScoringWindow, isAdmin: boolean): boolean {
  return isAdmin || window.open;
}
