import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import Database from 'better-sqlite3';
import type {
  CheckInStatus,
  CurrentWeek,
  FaInvite,
  FaInviteStatus,
  FreeAgent,
  Game,
  GameLineup,
  Landing,
  LandingContent,
  LeagueData,
  LineupPlayer,
  ManagerAuthorization,
  Player,
  PlayerAccount,
  PlayerBattingLine,
  PlayerStats,
  PublicPlayerProfile,
  PublicUser,
  Role,
  SkillLevel,
  StandingRow,
  Suggestion,
  Team,
  TeamAttendance,
  TeamBoard,
  TeamMember,
  TeamMessage,
  TeamManagerSummary,
  TeamWeekGame,
  User,
  WaiverStatus,
} from './types.js';
import { SKILL_LEVELS } from './types.js';
import {
  TEAM_ROSTER_SPOTS,
  buildPlayerStatsWorkbook,
  envSpreadsheetId,
  parseSheetsSettings,
  type PlayerStatsWorkbook,
  type SheetPlayerInput,
  type SheetsSettings,
} from './playerStatsSheet.js';
import { createSeedData } from './seed.js';
import { DEFAULT_LOCATION, DEFAULT_WEEKS, generateRoundRobin, type GenerateOptions } from './schedule.js';
import {
  SIM_FREE_AGENT_COUNT,
  SIM_GUESTS_PER_TEAM,
  pickSimHit,
  pickSimOut,
  rotateLineup,
  simGuestName,
  simJersey,
  simPhone,
  simPhotoUrl,
  simPosition,
  simSharePhone,
  simSkill,
  simWaiver,
} from './simSeason.js';
import { hashPassword, verifyPassword } from './auth.js';
import {
  DEFAULT_THEME_INPUT,
  normalizeThemeInput,
  parseStoredTheme,
  resolveTheme,
  type Theme,
  type ThemeInput,
} from './theme.js';
import {
  batterSide,
  boxFromParts,
  bumpInningLine,
  canEditLineup,
  clampStat,
  combineGameDateTime,
  emptyBattingLine,
  emptyLine,
  isHitResult,
  isLivePlayResult,
  isOutResult,
  lineForDisplay,
  lineupLocksAt,
  normalizePlayResult,
  parseHalf,
  parseLine,
  parsePlayerIds,
  scheduledStartMs,
  stepBatterIndex,
  stepHalfInning,
  sumLine,
  tallyBattingLine,
  wrapBatterIndex,
  type GameBoxScore,
  type GamePlay,
  type InningHalf,
  type ScoreSide,
  type ScoreStat,
  type StoredPlayResult,
} from './gameScoring.js';

export { combineGameDateTime };

export const MAX_PHOTO_URL_CHARS = 800000;
export const MAX_LANDING_HEADLINE_CHARS = 200;
export const MAX_LANDING_BODY_CHARS = 5000;
export const MAX_LANDING_LABEL_CHARS = 80;
export const MAX_SUGGESTION_CHARS = 2000;
export const MAX_MESSAGE_CHARS = 2000;

/** Checked-in "in" count that counts as a full weekly lineup. */
export const FULL_LINEUP_SIZE = 10;

/** Each team can have two managers so a backup can keep score. */
export const MANAGERS_PER_TEAM = 2;

/** Guest accounts created by the admin Test Data simulator. Easy to find/remove. */
export const SIM_EMAIL_DOMAIN = '@sim.local';
export const SIM_GUEST_PASSWORD = 'guestpass1';
export { SIM_FREE_AGENT_COUNT, SIM_GUESTS_PER_TEAM } from './simSeason.js';
const SIM_RNG_SEED = 20260922;

export interface TestDataGenerateSummary {
  alreadySeeded: boolean;
  guestsCreated: number;
  rosteredPlayers: number;
  freeAgents: number;
  checkIns: number;
  messages: number;
  gamesPlayed: number;
  invites: number;
}

export interface TestDataClearSummary {
  guestsRemoved: number;
  checkInsRemoved: number;
  messagesRemoved: number;
  gamesReset: number;
}

export const DEFAULT_LANDING: LandingContent = {
  headline: 'Welcome to the Oakdale Mens Softball League',
  body: 'Season updates and announcements will appear here. TODO: add real content.',
  imageUrl: null,
  countdownLabel: 'Opening Day',
  countdownTarget: null,
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  photoUrl TEXT
);
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  teamId TEXT NOT NULL,
  name TEXT NOT NULL,
  number INTEGER NOT NULL,
  position TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  homeTeamId TEXT NOT NULL,
  awayTeamId TEXT NOT NULL,
  homeScore INTEGER,
  awayScore INTEGER,
  played INTEGER NOT NULL,
  field TEXT NOT NULL,
  time TEXT NOT NULL,
  location TEXT NOT NULL,
  week INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  teamId TEXT,
  passwordHash TEXT NOT NULL,
  position TEXT,
  number INTEGER,
  photoUrl TEXT,
  onRoster INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  skillLevel TEXT,
  phone TEXT,
  sharePhone INTEGER NOT NULL DEFAULT 0,
  waiverUrl TEXT,
  waiverStatus TEXT NOT NULL DEFAULT 'none',
  waiverReviewedBy TEXT,
  waiverReviewedAt TEXT
);
CREATE TABLE IF NOT EXISTS fa_invites (
  id TEXT PRIMARY KEY,
  fromUserId TEXT NOT NULL,
  teamId TEXT NOT NULL,
  toUserId TEXT NOT NULL,
  gameId TEXT,
  week INTEGER,
  status TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pending_managers (
  email TEXT PRIMARY KEY,
  teamId TEXT NOT NULL,
  onRoster INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS check_ins (
  userId TEXT NOT NULL,
  week INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in', 'out')),
  PRIMARY KEY (userId, week)
);
CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  authorName TEXT,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  teamId TEXT NOT NULL,
  userId TEXT NOT NULL,
  authorName TEXT NOT NULL,
  text TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_team_created ON messages (teamId, createdAt);
CREATE TABLE IF NOT EXISTS game_logs (
  gameId TEXT PRIMARY KEY,
  homeHits INTEGER NOT NULL DEFAULT 0,
  awayHits INTEGER NOT NULL DEFAULT 0,
  homeWalks INTEGER NOT NULL DEFAULT 0,
  awayWalks INTEGER NOT NULL DEFAULT 0,
  homeOuts INTEGER NOT NULL DEFAULT 0,
  awayOuts INTEGER NOT NULL DEFAULT 0,
  currentOuts INTEGER NOT NULL DEFAULT 0,
  awayLine TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0]',
  homeLine TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0]',
  currentInning INTEGER NOT NULL DEFAULT 1,
  currentHalf TEXT NOT NULL DEFAULT 'top',
  awayBatterIndex INTEGER NOT NULL DEFAULT 0,
  homeBatterIndex INTEGER NOT NULL DEFAULT 0,
  liveStartedAt TEXT,
  updatedAt TEXT NOT NULL,
  updatedByUserId TEXT
);
CREATE TABLE IF NOT EXISTS game_lineups (
  gameId TEXT NOT NULL,
  teamId TEXT NOT NULL,
  playerIds TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  updatedByUserId TEXT,
  PRIMARY KEY (gameId, teamId)
);
CREATE TABLE IF NOT EXISTS game_plate_appearances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gameId TEXT NOT NULL,
  playerId TEXT NOT NULL,
  teamId TEXT NOT NULL,
  side TEXT NOT NULL,
  result TEXT NOT NULL,
  inning INTEGER,
  half TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pa_player ON game_plate_appearances (playerId);
CREATE INDEX IF NOT EXISTS idx_pa_game ON game_plate_appearances (gameId);
`;

type TeamRow = { id: string; name: string; photoUrl: string | null };
type PlayerRow = { id: string; teamId: string; name: string; number: number; position: string };
type GameRow = {
  id: string;
  date: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  played: number;
  field: string;
  time: string;
  location: string;
  week: number;
};
type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  teamId: string | null;
  passwordHash: string;
  position: string | null;
  number: number | null;
  photoUrl: string | null;
  onRoster?: number | null;
  createdAt: string;
  skillLevel?: string | null;
  phone?: string | null;
  sharePhone?: number | null;
  waiverUrl?: string | null;
  waiverStatus?: string | null;
  waiverReviewedBy?: string | null;
  waiverReviewedAt?: string | null;
};
type FaInviteRow = {
  id: string;
  fromUserId: string;
  teamId: string;
  toUserId: string;
  gameId: string | null;
  week: number | null;
  status: string;
  createdAt: string;
};
type CheckInRow = { userId: string; week: number; status: string };
type SuggestionRow = { id: string; text: string; authorName: string | null; createdAt: string };
type MessageRow = {
  id: string;
  teamId: string;
  userId: string;
  authorName: string;
  text: string;
  createdAt: string;
};
type GameLogRow = {
  gameId: string;
  homeHits: number;
  awayHits: number;
  homeWalks: number;
  awayWalks: number;
  homeOuts: number;
  awayOuts: number;
  currentOuts: number;
  awayLine?: string | null;
  homeLine?: string | null;
  currentInning?: number | null;
  currentHalf?: string | null;
  awayBatterIndex?: number | null;
  homeBatterIndex?: number | null;
  liveStartedAt: string | null;
  updatedAt: string;
  updatedByUserId: string | null;
};

export interface GameLog {
  gameId: string;
  homeHits: number;
  awayHits: number;
  homeWalks: number;
  awayWalks: number;
  homeOuts: number;
  awayOuts: number;
  currentOuts: number;
  awayLine: number[];
  homeLine: number[];
  currentInning: number;
  currentHalf: InningHalf;
  awayBatterIndex: number;
  homeBatterIndex: number;
  liveStartedAt: string | null;
  updatedAt: string;
  updatedByUserId: string | null;
}

function normalizeGame(g: Game): Game {
  return {
    ...g,
    field: g.field ?? '',
    time: g.time ?? '',
    location: g.location ?? DEFAULT_LOCATION,
    week: typeof g.week === 'number' ? g.week : 0,
  };
}

function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...pub } = user;
  return {
    ...pub,
    sharePhone: user.sharePhone === true,
    waiverStatus: user.waiverStatus ?? 'none',
  };
}

const EMPTY_ATTENDANCE: TeamAttendance = { in: 0, out: 0, none: 0, total: 0 };

function tallyAttendance(memberIds: string[], checkIns: Map<string, CheckInStatus>): TeamAttendance {
  let inn = 0;
  let out = 0;
  let none = 0;
  for (const id of memberIds) {
    const status = checkIns.get(id);
    if (status === 'in') inn += 1;
    else if (status === 'out') out += 1;
    else none += 1;
  }
  return { in: inn, out, none, total: memberIds.length };
}

/** Validate a stored data-URL thumbnail. Empty/null means "clear". */
function normalizePhotoUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    throw new Error('photoUrl must be a data:image URL or empty');
  }
  if (!value.startsWith('data:image/')) {
    throw new Error('photoUrl must start with data:image/');
  }
  if (value.length > MAX_PHOTO_URL_CHARS) {
    throw new Error(`photoUrl must be ${MAX_PHOTO_URL_CHARS} characters or fewer`);
  }
  return value;
}

function parseStoredLanding(raw: string | undefined): LandingContent {
  if (!raw) return { ...DEFAULT_LANDING };
  try {
    const parsed = JSON.parse(raw) as Partial<LandingContent>;
    return {
      headline: typeof parsed.headline === 'string' ? parsed.headline : DEFAULT_LANDING.headline,
      body: typeof parsed.body === 'string' ? parsed.body : DEFAULT_LANDING.body,
      imageUrl:
        parsed.imageUrl === null
          ? null
          : typeof parsed.imageUrl === 'string'
            ? parsed.imageUrl
            : DEFAULT_LANDING.imageUrl,
      countdownLabel:
        typeof parsed.countdownLabel === 'string' ? parsed.countdownLabel : DEFAULT_LANDING.countdownLabel,
      countdownTarget:
        parsed.countdownTarget === null
          ? null
          : typeof parsed.countdownTarget === 'string'
            ? parsed.countdownTarget
            : DEFAULT_LANDING.countdownTarget,
    };
  } catch {
    return { ...DEFAULT_LANDING };
  }
}

function clampText(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

function normalizeLandingImageUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    throw new Error('imageUrl must be a data:image URL or empty');
  }
  if (!value.startsWith('data:image/')) {
    throw new Error('imageUrl must start with data:image/');
  }
  if (value.length > MAX_PHOTO_URL_CHARS) {
    throw new Error(`imageUrl must be ${MAX_PHOTO_URL_CHARS} characters or fewer`);
  }
  return value;
}

function normalizeCountdownTarget(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    throw new Error('countdownTarget must be a datetime string or null');
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('countdownTarget must be a valid date');
  }
  return trimmed;
}

function normalizeJerseyNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

function backfillRole(role: string): Role {
  if (role === 'captain') return 'manager';
  if (role === 'member') return 'player';
  return role as Role;
}

/**
 * Historically the constructor took a `league.json` path (or null for memory).
 * SQLite files live next to that location as `league.db`. A directory path
 * (e.g. DATA_DIR) also resolves to `<dir>/league.db`.
 */
export function resolveSqlitePath(pathOrNull: string | null): string | null {
  if (!pathOrNull) return null;
  if (existsSync(pathOrNull) && statSync(pathOrNull).isDirectory()) {
    return join(pathOrNull, 'league.db');
  }
  if (pathOrNull.endsWith('.db')) return pathOrNull;
  const ext = extname(pathOrNull);
  if (!ext) return join(pathOrNull, 'league.db');
  return join(dirname(pathOrNull), 'league.db');
}

function teamFromRow(row: TeamRow): Team {
  const team: Team = { id: row.id, name: row.name };
  if (row.photoUrl) team.photoUrl = row.photoUrl;
  return team;
}

function playerFromRow(row: PlayerRow): Player {
  return {
    id: row.id,
    teamId: row.teamId,
    name: row.name,
    number: row.number,
    position: row.position,
  };
}

function gameFromRow(row: GameRow): Game {
  return normalizeGame({
    id: row.id,
    date: row.date,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    played: Number(row.played) === 1,
    field: row.field,
    time: row.time,
    location: row.location,
    week: row.week,
  });
}

function gameLogFromRow(row: GameLogRow): GameLog {
  const currentInning = Math.max(1, Number(row.currentInning) || 1);
  const currentHalf = parseHalf(row.currentHalf);
  const awayLine = lineForDisplay(parseLine(row.awayLine), currentInning, parseLine(row.homeLine));
  const homeLine = lineForDisplay(parseLine(row.homeLine), currentInning, awayLine);
  return {
    gameId: row.gameId,
    homeHits: row.homeHits,
    awayHits: row.awayHits,
    homeWalks: row.homeWalks,
    awayWalks: row.awayWalks,
    homeOuts: row.homeOuts,
    awayOuts: row.awayOuts,
    currentOuts: row.currentOuts,
    awayLine,
    homeLine,
    currentInning,
    currentHalf,
    awayBatterIndex: Math.max(0, Number(row.awayBatterIndex) || 0),
    homeBatterIndex: Math.max(0, Number(row.homeBatterIndex) || 0),
    liveStartedAt: row.liveStartedAt,
    updatedAt: row.updatedAt,
    updatedByUserId: row.updatedByUserId,
  };
}

function userOnRoster(user: Pick<User, 'role' | 'teamId' | 'onRoster'>): boolean {
  if (!user.teamId) return false;
  if (user.role === 'player') return true;
  if (user.role === 'manager') return user.onRoster !== false;
  return false;
}

function userFromRow(row: UserRow): User {
  const user: User = {
    id: row.id,
    email: row.email,
    name: row.name,
    role: backfillRole(row.role),
    teamId: row.teamId,
    onRoster: row.onRoster !== 0,
    passwordHash: row.passwordHash,
    createdAt: row.createdAt,
    sharePhone: row.sharePhone === 1,
    waiverStatus: normalizeWaiverStatus(row.waiverStatus),
  };
  if (row.position) user.position = row.position;
  if (row.number != null) user.number = row.number;
  if (row.photoUrl) user.photoUrl = row.photoUrl;
  user.skillLevel = normalizeSkillLevel(row.skillLevel);
  user.phone = row.phone ?? null;
  user.waiverUrl = row.waiverUrl ?? null;
  user.waiverReviewedBy = row.waiverReviewedBy ?? null;
  user.waiverReviewedAt = row.waiverReviewedAt ?? null;
  return user;
}

function normalizeSkillLevel(value: unknown): SkillLevel | null {
  if (typeof value !== 'string' || !value) return null;
  return (SKILL_LEVELS as readonly string[]).includes(value) ? (value as SkillLevel) : null;
}

function normalizeWaiverStatus(value: unknown): WaiverStatus {
  if (value === 'pending' || value === 'approved' || value === 'rejected') return value;
  return 'none';
}

function normalizePhone(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error('phone must be a string');
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 24) throw new Error('phone is too long');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7) throw new Error('Enter a valid phone number');
  return trimmed;
}

function canReviewWaiver(actor: PublicUser | undefined | null, target: Pick<User, 'teamId'>): boolean {
  if (!actor) return false;
  if (actor.role === 'admin') return true;
  if (actor.role === 'manager' && actor.teamId) {
    return !target.teamId || target.teamId === actor.teamId;
  }
  return false;
}

function canSeePhone(actor: PublicUser | undefined | null, target: Pick<User, 'id' | 'phone' | 'sharePhone'>): boolean {
  if (!target.phone) return false;
  if (!actor) return false;
  if (actor.id === target.id) return true;
  if (actor.role === 'admin') return true;
  return actor.role === 'manager' && target.sharePhone === true;
}

function normalizeWaiverUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    throw new Error('waiverUrl must be a data URL or empty');
  }
  if (!value.startsWith('data:image/') && !value.startsWith('data:application/pdf')) {
    throw new Error('waiver must be an image or PDF');
  }
  if (value.length > MAX_PHOTO_URL_CHARS) {
    throw new Error(`waiver must be ${MAX_PHOTO_URL_CHARS} characters or fewer`);
  }
  return value;
}

function suggestionFromRow(row: SuggestionRow): Suggestion {
  return {
    id: row.id,
    text: row.text,
    authorName: row.authorName,
    createdAt: row.createdAt,
  };
}

function messageFromRow(row: MessageRow): TeamMessage {
  return {
    id: row.id,
    teamId: row.teamId,
    userId: row.userId,
    authorName: row.authorName,
    text: row.text,
    createdAt: row.createdAt,
  };
}

let rowIdSeq = 0;

function newRowId(prefix: string): string {
  rowIdSeq = (rowIdSeq + 1) % 100000;
  return `${prefix}${Date.now()}${rowIdSeq}${Math.floor(Math.random() * 1000)}`;
}

/** Deterministic 0–1 RNG (mulberry32) so simulated scores/chat stay stable. */
function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SIM_CHAT_LINES = [
  'See everyone at the field!',
  "I'll bring the bats",
  'Running 5 min late',
  'Who has the extra bases?',
  "Let's go 🥎",
  'Great game last week',
  'I can grab drinks after',
  'Field 2 tonight, right?',
  'Anyone need a ride?',
  'Bring sunscreen — it is bright out',
];

/**
 * SQLite-backed data store. The public interface matches the previous
 * JSON-file LeagueStore: `null` is an in-memory DB (tests); a path opens
 * `<dir>/league.db` and one-time-imports a sibling `league.json` if present.
 */
export class LeagueStore {
  private readonly db: Database.Database;

  constructor(pathOrNull: string | null = null) {
    const sqlitePath = resolveSqlitePath(pathOrNull);
    if (sqlitePath) {
      mkdirSync(dirname(sqlitePath), { recursive: true });
      this.db = new Database(sqlitePath);
      this.db.pragma('journal_mode = WAL');
    } else {
      this.db = new Database(':memory:');
    }
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(SCHEMA);
    this.ensureUserColumns();
    this.ensureGameLogColumns();
    this.ensureFaInvitesTable();
    this.ensurePlateAppearancesTable();
    if (sqlitePath) this.importLegacyJsonIfNeeded(sqlitePath);
    this.seedIfEmpty();
  }

  /** Close the SQLite connection. Safe to call more than once. */
  close(): void {
    if (this.db.open) this.db.close();
  }

  private countTeams(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM teams').get() as { c: number };
    return row.c;
  }

  private seedIfEmpty(): void {
    if (this.countTeams() > 0) return;
    const seed = createSeedData();
    const insertTeam = this.db.prepare(
      'INSERT INTO teams (id, name, photoUrl) VALUES (@id, @name, @photoUrl)',
    );
    const tx = this.db.transaction(() => {
      for (const team of seed.teams) {
        insertTeam.run({ id: team.id, name: team.name, photoUrl: team.photoUrl ?? null });
      }
      this.db
        .prepare("INSERT INTO settings (key, value) VALUES ('rules', ?) ON CONFLICT(key) DO NOTHING")
        .run(seed.rules);
      this.db
        .prepare("INSERT INTO settings (key, value) VALUES ('landing', ?) ON CONFLICT(key) DO NOTHING")
        .run(JSON.stringify(DEFAULT_LANDING));
      this.db
        .prepare("INSERT INTO settings (key, value) VALUES ('theme', ?) ON CONFLICT(key) DO NOTHING")
        .run(JSON.stringify(DEFAULT_THEME_INPUT));
    });
    tx();
  }

  private importLegacyJsonIfNeeded(sqlitePath: string): void {
    if (this.countTeams() > 0) return;
    const jsonPath = join(dirname(sqlitePath), 'league.json');
    if (!existsSync(jsonPath)) return;
    this.importLegacyJson(jsonPath);
    renameSync(jsonPath, `${jsonPath}.imported`);
  }

  private importLegacyJson(jsonPath: string): void {
    const parsed = JSON.parse(readFileSync(jsonPath, 'utf-8')) as Partial<LeagueData>;
    const data: LeagueData = {
      teams: Array.isArray(parsed.teams) ? parsed.teams : [],
      players: Array.isArray(parsed.players) ? parsed.players : [],
      games: Array.isArray(parsed.games) ? parsed.games.map(normalizeGame) : [],
      users: Array.isArray(parsed.users) ? parsed.users : [],
      pendingManagers: Array.isArray(parsed.pendingManagers) ? parsed.pendingManagers : [],
      rules: typeof parsed.rules === 'string' ? parsed.rules : createSeedData().rules,
    };

    for (const user of data.users) {
      user.role = backfillRole(user.role as string);
    }

    const insertTeam = this.db.prepare(
      'INSERT INTO teams (id, name, photoUrl) VALUES (@id, @name, @photoUrl)',
    );
    const insertPlayer = this.db.prepare(
      'INSERT INTO players (id, teamId, name, number, position) VALUES (@id, @teamId, @name, @number, @position)',
    );
    const insertGame = this.db.prepare(
      `INSERT INTO games (id, date, homeTeamId, awayTeamId, homeScore, awayScore, played, field, time, location, week)
       VALUES (@id, @date, @homeTeamId, @awayTeamId, @homeScore, @awayScore, @played, @field, @time, @location, @week)`,
    );
    const insertUser = this.db.prepare(
      `INSERT INTO users (id, email, name, role, teamId, passwordHash, position, number, photoUrl, onRoster, createdAt)
       VALUES (@id, @email, @name, @role, @teamId, @passwordHash, @position, @number, @photoUrl, @onRoster, @createdAt)`,
    );
    const insertPending = this.db.prepare(
      'INSERT INTO pending_managers (email, teamId, onRoster) VALUES (@email, @teamId, @onRoster)',
    );

    const tx = this.db.transaction(() => {
      for (const team of data.teams) {
        insertTeam.run({ id: team.id, name: team.name, photoUrl: team.photoUrl ?? null });
      }
      for (const player of data.players) {
        insertPlayer.run(player);
      }
      for (const game of data.games) {
        insertGame.run({
          ...game,
          played: game.played ? 1 : 0,
        });
      }
      for (const user of data.users) {
        insertUser.run({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          teamId: user.teamId ?? null,
          passwordHash: user.passwordHash,
          position: user.position ?? null,
          number: user.number ?? null,
          photoUrl: user.photoUrl ?? null,
          onRoster: user.onRoster === false ? 0 : 1,
          createdAt: user.createdAt,
        });
      }
      for (const pending of data.pendingManagers) {
        insertPending.run({
          email: pending.email,
          teamId: pending.teamId,
          onRoster: pending.onRoster === false ? 0 : 1,
        });
      }
      this.db
        .prepare(
          "INSERT INTO settings (key, value) VALUES ('rules', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run(data.rules);
    });
    tx();
  }

  private insertUserRow(user: User): void {
    this.db
      .prepare(
        `INSERT INTO users (id, email, name, role, teamId, passwordHash, position, number, photoUrl, onRoster, createdAt,
           skillLevel, phone, sharePhone, waiverUrl, waiverStatus, waiverReviewedBy, waiverReviewedAt)
         VALUES (@id, @email, @name, @role, @teamId, @passwordHash, @position, @number, @photoUrl, @onRoster, @createdAt,
           @skillLevel, @phone, @sharePhone, @waiverUrl, @waiverStatus, @waiverReviewedBy, @waiverReviewedAt)`,
      )
      .run({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        teamId: user.teamId,
        passwordHash: user.passwordHash,
        position: user.position ?? null,
        number: user.number ?? null,
        photoUrl: user.photoUrl ?? null,
        onRoster: user.onRoster === false ? 0 : 1,
        createdAt: user.createdAt,
        skillLevel: user.skillLevel ?? null,
        phone: user.phone ?? null,
        sharePhone: user.sharePhone ? 1 : 0,
        waiverUrl: user.waiverUrl ?? null,
        waiverStatus: user.waiverStatus ?? 'none',
        waiverReviewedBy: user.waiverReviewedBy ?? null,
        waiverReviewedAt: user.waiverReviewedAt ?? null,
      });
  }

  private updateUserRow(user: User): void {
    this.db
      .prepare(
        `UPDATE users SET email = @email, name = @name, role = @role, teamId = @teamId,
         passwordHash = @passwordHash, position = @position, number = @number, photoUrl = @photoUrl,
         onRoster = @onRoster, createdAt = @createdAt, skillLevel = @skillLevel, phone = @phone,
         sharePhone = @sharePhone, waiverUrl = @waiverUrl, waiverStatus = @waiverStatus,
         waiverReviewedBy = @waiverReviewedBy, waiverReviewedAt = @waiverReviewedAt
         WHERE id = @id`,
      )
      .run({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        teamId: user.teamId,
        passwordHash: user.passwordHash,
        position: user.position ?? null,
        number: user.number ?? null,
        photoUrl: user.photoUrl ?? null,
        onRoster: user.onRoster === false ? 0 : 1,
        createdAt: user.createdAt,
        skillLevel: user.skillLevel ?? null,
        phone: user.phone ?? null,
        sharePhone: user.sharePhone ? 1 : 0,
        waiverUrl: user.waiverUrl ?? null,
        waiverStatus: user.waiverStatus ?? 'none',
        waiverReviewedBy: user.waiverReviewedBy ?? null,
        waiverReviewedAt: user.waiverReviewedAt ?? null,
      });
  }

  getTeams(): Team[] {
    const rows = this.db.prepare('SELECT id, name, photoUrl FROM teams').all() as TeamRow[];
    return rows.map(teamFromRow).sort((a, b) => a.name.localeCompare(b.name));
  }

  getTeam(teamId: string): Team | undefined {
    const row = this.db
      .prepare('SELECT id, name, photoUrl FROM teams WHERE id = ?')
      .get(teamId) as TeamRow | undefined;
    return row ? teamFromRow(row) : undefined;
  }

  /** Last regular-season game date (YYYY-MM-DD), or null before a schedule exists. */
  getLastRegularSeasonDate(): string | null {
    const row = this.db.prepare('SELECT MAX(date) AS lastDate FROM games').get() as {
      lastDate: string | null;
    };
    return row.lastDate ?? null;
  }

  /**
   * Free agency stays open through the last regular-season game day.
   * The day after that (when playoffs would start) it closes.
   * No schedule yet → still open so people can sign up.
   */
  isFreeAgencyOpen(now = new Date()): boolean {
    const last = this.getLastRegularSeasonDate();
    if (!last) return true;
    return now.toISOString().slice(0, 10) <= last;
  }

  /** Player-role accounts with no team (public-safe, no email). */
  getFreeAgents(viewer?: PublicUser | null): FreeAgent[] {
    const invited = viewer?.role === 'manager' && viewer.teamId ? this.pendingInviteeIds(viewer.teamId) : new Set<string>();
    const rows = this.db.prepare('SELECT * FROM users').all() as UserRow[];
    return rows
      .map(userFromRow)
      .filter((u) => u.role === 'player' && !u.teamId)
      .map((u): FreeAgent => ({
        id: u.id,
        name: u.name,
        photoUrl: u.photoUrl,
        number: u.number ?? null,
        position: u.position,
        skillLevel: u.skillLevel ?? null,
        waiverStatus: u.waiverStatus,
        invitedByMe: invited.has(u.id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private weekGamesByTeam(): Map<string, TeamWeekGame> {
    const current = this.getCurrentWeek();
    const out = new Map<string, TeamWeekGame>();
    if (!current) return out;
    const names = new Map(this.getTeams().map((t) => [t.id, t.name]));
    for (const game of this.getSchedule()) {
      if (game.week !== current.week) continue;
      out.set(game.homeTeamId, {
        id: game.id,
        date: game.date,
        time: game.time,
        field: game.field,
        location: game.location,
        opponentName: names.get(game.awayTeamId) ?? game.awayTeamId,
        home: true,
      });
      out.set(game.awayTeamId, {
        id: game.id,
        date: game.date,
        time: game.time,
        field: game.field,
        location: game.location,
        opponentName: names.get(game.homeTeamId) ?? game.homeTeamId,
        home: false,
      });
    }
    return out;
  }

  /**
   * Teams list with live lineup status (checked-in "in" vs FULL_LINEUP_SIZE)
   * plus the current free-agent pool.
   */
  getTeamBoard(viewer?: PublicUser | null): TeamBoard {
    const teams = this.getTeams();
    const current = this.getCurrentWeek();
    const checkIns = current ? this.getCheckInsForWeek(current.week) : new Map<string, CheckInStatus>();
    const membersByTeam = this.accountMemberIdsByTeam();
    const weekGames = this.weekGamesByTeam();
    return {
      currentWeek: current,
      fullLineupSize: FULL_LINEUP_SIZE,
      rosterSpots: TEAM_ROSTER_SPOTS,
      managerSpots: MANAGERS_PER_TEAM,
      freeAgencyOpen: this.isFreeAgencyOpen(),
      lastRegularSeasonDate: this.getLastRegularSeasonDate(),
      freeAgents: this.getFreeAgents(viewer),
      teams: teams.map((team) => {
        const memberIds = membersByTeam.get(team.id) ?? [];
        const checkedInCount = memberIds.filter((id) => checkIns.get(id) === 'in').length;
        const managers = this.getTeamManagers(team.id);
        return {
          ...team,
          memberCount: memberIds.length,
          rosterFilled: memberIds.length + this.getRoster(team.id).length,
          checkedInCount,
          lineupStatus: checkedInCount >= FULL_LINEUP_SIZE ? 'full_lineup' : 'need_guys',
          manager: managers[0] ?? null,
          managers,
          weekGame: weekGames.get(team.id) ?? null,
        };
      }),
    };
  }

  getRoster(teamId: string): Player[] {
    const rows = this.db
      .prepare('SELECT id, teamId, name, number, position FROM players WHERE teamId = ?')
      .all(teamId) as PlayerRow[];
    return rows.map(playerFromRow).sort((a, b) => a.number - b.number);
  }

  getSchedule(): Game[] {
    const rows = this.db
      .prepare(
        'SELECT id, date, homeTeamId, awayTeamId, homeScore, awayScore, played, field, time, location, week FROM games',
      )
      .all() as GameRow[];
    return rows.map(gameFromRow).sort((a, b) => {
      if (a.week !== b.week) return a.week - b.week;
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      const byTime = a.time.localeCompare(b.time);
      if (byTime !== 0) return byTime;
      return a.field.localeCompare(b.field);
    });
  }

  getRules(): string {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'rules'").get() as
      | { value: string }
      | undefined;
    return row?.value ?? '';
  }

  setRules(text: string): string {
    if (typeof text !== 'string') {
      throw new Error('Rules must be text');
    }
    const rules = text.trim();
    this.db
      .prepare(
        "INSERT INTO settings (key, value) VALUES ('rules', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(rules);
    return rules;
  }

  getLanding(): Landing {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'landing'").get() as
      | { value: string }
      | undefined;
    const content = parseStoredLanding(row?.value);
    const effectiveCountdownTarget = content.countdownTarget ?? this.earliestGameDateTime();
    return { ...content, effectiveCountdownTarget };
  }

  setLanding(partial: Partial<LandingContent>): Landing {
    const current = parseStoredLanding(
      (
        this.db.prepare("SELECT value FROM settings WHERE key = 'landing'").get() as
          | { value: string }
          | undefined
      )?.value,
    );
    const next: LandingContent = { ...current };

    if (partial.headline !== undefined) {
      if (typeof partial.headline !== 'string') throw new Error('headline must be a string');
      next.headline = clampText(partial.headline.trim(), MAX_LANDING_HEADLINE_CHARS);
    }
    if (partial.body !== undefined) {
      if (typeof partial.body !== 'string') throw new Error('body must be a string');
      next.body = clampText(partial.body.trim(), MAX_LANDING_BODY_CHARS);
    }
    if (partial.countdownLabel !== undefined) {
      if (typeof partial.countdownLabel !== 'string') throw new Error('countdownLabel must be a string');
      next.countdownLabel = clampText(partial.countdownLabel.trim(), MAX_LANDING_LABEL_CHARS);
    }
    if (partial.imageUrl !== undefined) {
      next.imageUrl = normalizeLandingImageUrl(partial.imageUrl);
    }
    if (partial.countdownTarget !== undefined) {
      next.countdownTarget = normalizeCountdownTarget(partial.countdownTarget);
    }

    this.db
      .prepare(
        "INSERT INTO settings (key, value) VALUES ('landing', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(JSON.stringify(next));
    return this.getLanding();
  }

  getTheme(): Theme {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'theme'").get() as
      | { value: string }
      | undefined;
    return resolveTheme(parseStoredTheme(row?.value));
  }

  setTheme(input: unknown): Theme {
    const next: ThemeInput = normalizeThemeInput(input);
    this.db
      .prepare(
        "INSERT INTO settings (key, value) VALUES ('theme', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(JSON.stringify(next));
    return this.getTheme();
  }

  getSheetsSettings(): SheetsSettings {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'sheets'").get() as
      | { value: string }
      | undefined;
    return parseSheetsSettings(row?.value, envSpreadsheetId());
  }

  setSheetsSettings(partial: Partial<SheetsSettings>): SheetsSettings {
    const next = { ...this.getSheetsSettings(), ...partial };
    if (partial.spreadsheetId !== undefined) {
      const id = String(partial.spreadsheetId ?? '').trim();
      next.spreadsheetId = id || envSpreadsheetId();
    }
    this.db
      .prepare(
        "INSERT INTO settings (key, value) VALUES ('sheets', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(JSON.stringify(next));
    return next;
  }

  /**
   * Account members on a roster, unregistered `players` rows, and free agents.
   * Manager-only accounts and admins are omitted.
   */
  collectSheetPlayers(): SheetPlayerInput[] {
    const teams = this.getTeams();
    const seen = new Set<string>();
    const players: SheetPlayerInput[] = [];

    for (const team of teams) {
      for (const member of this.getTeamMembers(team.id)) {
        if (seen.has(member.id)) continue;
        seen.add(member.id);
        players.push({
          id: member.id,
          name: member.name,
          number: member.number,
          position: member.position,
          teamId: team.id,
          teamName: team.name,
        });
      }
      for (const roster of this.getRoster(team.id)) {
        if (seen.has(roster.id)) continue;
        seen.add(roster.id);
        players.push({
          id: roster.id,
          name: roster.name,
          number: roster.number,
          position: roster.position,
          teamId: team.id,
          teamName: team.name,
        });
      }
    }

    for (const agent of this.getFreeAgents()) {
      if (seen.has(agent.id)) continue;
      seen.add(agent.id);
      players.push({
        id: agent.id,
        name: agent.name,
        number: agent.number ?? null,
        position: agent.position,
        teamId: null,
        teamName: null,
      });
    }

    const stats = this.getPlayerStatsMap(players.map((player) => player.id));
    return players.map((player) => ({
      ...player,
      stats: stats.get(player.id) ?? emptyBattingLine(),
    }));
  }

  buildPlayerStatsWorkbook(updatedAt = new Date().toISOString()): PlayerStatsWorkbook {
    const settings = this.getSheetsSettings();
    return buildPlayerStatsWorkbook({
      teams: this.getTeams(),
      players: this.collectSheetPlayers(),
      spreadsheetId: settings.spreadsheetId,
      updatedAt,
    });
  }

  /** Earliest scheduled game as a naive local datetime, or null if none. */
  private earliestGameDateTime(): string | null {
    const rows = this.db.prepare('SELECT date, time FROM games').all() as Array<{ date: string; time: string }>;
    let earliest: string | null = null;
    for (const row of rows) {
      const combined = combineGameDateTime(row.date, row.time);
      if (!combined) continue;
      if (!earliest || combined < earliest) earliest = combined;
    }
    return earliest;
  }

  /**
   * Replace the season schedule with a freshly generated regular-season set
   * (one Wednesday-night round per week) built from the current teams.
   */
  generateSchedule(options: GenerateOptions = {}): Game[] {
    const teams = this.db.prepare('SELECT id, name, photoUrl FROM teams ORDER BY rowid').all() as TeamRow[];
    if (teams.length < 2) {
      throw new Error('Need at least two teams to generate a schedule');
    }
    const games = generateRoundRobin(teams.map(teamFromRow), options);
    const insert = this.db.prepare(
      `INSERT INTO games (id, date, homeTeamId, awayTeamId, homeScore, awayScore, played, field, time, location, week)
       VALUES (@id, @date, @homeTeamId, @awayTeamId, @homeScore, @awayScore, @played, @field, @time, @location, @week)`,
    );
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM game_plate_appearances').run();
      this.db.prepare('DELETE FROM game_logs').run();
      this.db.prepare('DELETE FROM game_lineups').run();
      this.db.prepare('DELETE FROM games').run();
      this.db.prepare('DELETE FROM check_ins').run();
      for (const game of games) {
        insert.run({ ...game, played: game.played ? 1 : 0 });
      }
    });
    tx();
    return this.getSchedule();
  }

  addPlayer(input: Omit<Player, 'id'>): Player {
    if (!this.getTeam(input.teamId)) {
      throw new Error(`Unknown team: ${input.teamId}`);
    }
    if (!input.name || !input.name.trim()) {
      throw new Error('Player name is required');
    }
    const player: Player = {
      id: `p${Date.now()}${Math.floor(Math.random() * 1000)}`,
      teamId: input.teamId,
      name: input.name.trim(),
      number: Number(input.number) || 0,
      position: input.position?.trim() || 'Utility',
    };
    this.db
      .prepare(
        'INSERT INTO players (id, teamId, name, number, position) VALUES (@id, @teamId, @name, @number, @position)',
      )
      .run(player);
    return player;
  }

  recordResult(gameId: string, homeScore: number, awayScore: number, userId?: string): Game {
    const game = this.getGame(gameId);
    if (!game) {
      throw new Error(`Unknown game: ${gameId}`);
    }
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore < 0 || awayScore < 0) {
      throw new Error('Scores must be non-negative numbers');
    }
    const now = new Date().toISOString();
    const awayLine = bumpInningLine(emptyLine(), 1, awayScore);
    const homeLine = bumpInningLine(emptyLine(), 1, homeScore);
    const tx = this.db.transaction(() => {
      this.db
        .prepare('UPDATE games SET homeScore = ?, awayScore = ?, played = 1 WHERE id = ?')
        .run(homeScore, awayScore, gameId);
      this.ensureGameLog(gameId);
      this.db
        .prepare(
          'UPDATE game_logs SET awayLine = ?, homeLine = ?, updatedAt = ?, updatedByUserId = ? WHERE gameId = ?',
        )
        .run(JSON.stringify(awayLine), JSON.stringify(homeLine), now, userId ?? null, gameId);
    });
    tx();
    game.homeScore = homeScore;
    game.awayScore = awayScore;
    game.played = true;
    return game;
  }

  getGameLog(gameId: string): GameLog | undefined {
    const row = this.db.prepare('SELECT * FROM game_logs WHERE gameId = ?').get(gameId) as GameLogRow | undefined;
    return row ? gameLogFromRow(row) : undefined;
  }

  getGameLogs(): Map<string, GameLog> {
    const rows = this.db.prepare('SELECT * FROM game_logs').all() as GameLogRow[];
    return new Map(rows.map((row) => [row.gameId, gameLogFromRow(row)]));
  }

  getGameBox(game: Game, log?: GameLog | null): GameBoxScore {
    return boxFromParts(game.homeScore, game.awayScore, log ?? this.getGameLog(game.id));
  }

  listLineupCandidates(teamId: string): LineupPlayer[] {
    const members = this.getTeamMembers(teamId).map(
      (m): LineupPlayer => ({
        id: m.id,
        name: m.name,
        number: m.number,
        position: m.position,
      }),
    );
    const seen = new Set(members.map((m) => m.id));
    const extras = this.getRoster(teamId)
      .filter((p) => !seen.has(p.id))
      .map(
        (p): LineupPlayer => ({
          id: p.id,
          name: p.name,
          number: p.number,
          position: p.position,
        }),
      );
    return [...members, ...extras];
  }

  getLineupSlots(gameId: string, teamId: string): { slots: LineupPlayer[]; saved: boolean } {
    const candidates = this.listLineupCandidates(teamId);
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const row = this.db
      .prepare('SELECT playerIds FROM game_lineups WHERE gameId = ? AND teamId = ?')
      .get(gameId, teamId) as { playerIds: string } | undefined;
    const savedIds = parsePlayerIds(row?.playerIds);
    const slots = savedIds.map((id) => byId.get(id)).filter((slot): slot is LineupPlayer => Boolean(slot));
    if (slots.length > 0) return { slots, saved: true };
    return { slots: candidates, saved: false };
  }

  buildGameLineup(
    game: Game,
    teamId: string,
    user?: PublicUser | null,
    nowMs = Date.now(),
    statsByPlayer?: Map<string, PlayerBattingLine>,
  ): GameLineup {
    const { slots: rawSlots, saved } = this.getLineupSlots(game.id, teamId);
    const slots = rawSlots.map((slot) => ({
      ...slot,
      stats: statsByPlayer?.get(slot.id) ?? emptyBattingLine(),
    }));
    const log = this.getGameLog(game.id);
    const index =
      teamId === game.homeTeamId ? (log?.homeBatterIndex ?? 0) : teamId === game.awayTeamId ? (log?.awayBatterIndex ?? 0) : 0;
    const atBat = slots.length ? slots[wrapBatterIndex(index, slots.length)] : null;
    const onDeck = slots.length ? slots[wrapBatterIndex(index + 1, slots.length)] : null;
    const scheduledMs = scheduledStartMs(game.date, game.time);
    const isAdmin = user?.role === 'admin';
    const ownsTeam = Boolean(user && (isAdmin || (user.role === 'manager' && user.teamId === teamId)));
    return {
      teamId,
      slots,
      atBat,
      onDeck,
      canEdit: ownsTeam && canEditLineup(scheduledMs, nowMs, isAdmin),
      locksAt: lineupLocksAt(scheduledMs),
      saved,
    };
  }

  setGameLineup(gameId: string, teamId: string, playerIds: string[], userId: string): void {
    const game = this.getGame(gameId);
    if (!game) throw new Error(`Unknown game: ${gameId}`);
    if (teamId !== game.homeTeamId && teamId !== game.awayTeamId) {
      throw new Error('Team is not playing in this game');
    }
    const allowed = new Set(this.listLineupCandidates(teamId).map((p) => p.id));
    const ids = parsePlayerIds(playerIds);
    if (ids.length === 0) throw new Error('Lineup needs at least one player');
    if (new Set(ids).size !== ids.length) throw new Error('Lineup cannot list the same player twice');
    const unknown = ids.find((id) => !allowed.has(id));
    if (unknown) throw new Error('Every lineup player must be on this team');
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO game_lineups (gameId, teamId, playerIds, updatedAt, updatedByUserId)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(gameId, teamId) DO UPDATE SET
           playerIds = excluded.playerIds,
           updatedAt = excluded.updatedAt,
           updatedByUserId = excluded.updatedByUserId`,
      )
      .run(gameId, teamId, JSON.stringify(ids), now, userId);
  }

  private lineupLength(gameId: string, teamId: string): number {
    return this.getLineupSlots(gameId, teamId).slots.length;
  }

  private stepOutsAndBatters(
    log: GameLog,
    awayLen: number,
    homeLen: number,
    delta: number,
  ): {
    inning: number;
    half: InningHalf;
    outs: number;
    awayBatterIndex: number;
    homeBatterIndex: number;
  } {
    let inning = log.currentInning;
    let half = log.currentHalf;
    let outs = log.currentOuts;
    let awayBatterIndex = log.awayBatterIndex;
    let homeBatterIndex = log.homeBatterIndex;
    const step = Math.trunc(delta);
    if (step > 0) {
      for (let i = 0; i < step; i += 1) {
        if (half === 'top') awayBatterIndex = stepBatterIndex(awayBatterIndex, awayLen, 1);
        else homeBatterIndex = stepBatterIndex(homeBatterIndex, homeLen, 1);
        const next = stepHalfInning(inning, half, outs, 1);
        inning = next.inning;
        half = next.half;
        outs = next.outs;
      }
    } else {
      for (let i = 0; i < -step; i += 1) {
        const next = stepHalfInning(inning, half, outs, -1);
        inning = next.inning;
        half = next.half;
        outs = next.outs;
        if (half === 'top') awayBatterIndex = stepBatterIndex(awayBatterIndex, awayLen, -1);
        else homeBatterIndex = stepBatterIndex(homeBatterIndex, homeLen, -1);
      }
    }
    return { inning, half, outs, awayBatterIndex, homeBatterIndex };
  }

  startLiveGame(gameId: string, userId: string, now = new Date()): GameLog {
    const game = this.getGame(gameId);
    if (!game) {
      throw new Error(`Unknown game: ${gameId}`);
    }
    const iso = now.toISOString();
    const tx = this.db.transaction(() => {
      this.ensureGameLog(gameId);
      const existing = this.getGameLog(gameId);
      if (existing?.liveStartedAt) return;
      this.db
        .prepare(
          'UPDATE game_logs SET liveStartedAt = ?, updatedAt = ?, updatedByUserId = ? WHERE gameId = ?',
        )
        .run(iso, iso, userId, gameId);
    });
    tx();
    return this.getGameLog(gameId)!;
  }

  bumpScoreStat(gameId: string, side: ScoreSide, stat: ScoreStat, delta: number, userId: string): Game {
    const game = this.getGame(gameId);
    if (!game) {
      throw new Error(`Unknown game: ${gameId}`);
    }
    if (side !== 'home' && side !== 'away') {
      throw new Error('side must be home or away');
    }
    if (stat !== 'runs' && stat !== 'hits' && stat !== 'walks' && stat !== 'outs') {
      throw new Error('stat must be runs, hits, walks, or outs');
    }
    const step = Math.trunc(delta);
    if (!Number.isFinite(step) || step === 0) {
      return game;
    }
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.ensureGameLog(gameId);
      if (stat === 'runs') {
        const log = this.getGameLog(gameId)!;
        this.writeInningRun(gameId, side, log.currentInning, step, now, userId);
      } else {
        const column =
          stat === 'hits'
            ? side === 'home'
              ? 'homeHits'
              : 'awayHits'
            : stat === 'walks'
              ? side === 'home'
                ? 'homeWalks'
                : 'awayWalks'
              : side === 'home'
                ? 'homeOuts'
                : 'awayOuts';
        const log = this.getGameLog(gameId)!;
        const next = clampStat(Number(log[column]) + step);
        this.db.prepare(`UPDATE game_logs SET ${column} = ? WHERE gameId = ?`).run(next, gameId);
        if (stat === 'hits' || stat === 'walks') {
          const length = this.lineupLength(gameId, side === 'home' ? game.homeTeamId : game.awayTeamId);
          const indexCol = side === 'home' ? 'homeBatterIndex' : 'awayBatterIndex';
          const paResult: StoredPlayResult = stat === 'hits' ? 'single' : 'walk';
          let index = log[indexCol];
          if (step > 0) {
            for (let i = 0; i < step; i += 1) {
              this.creditBatter(game, side, paResult, index, log.currentInning, log.currentHalf);
              index = stepBatterIndex(index, length, 1);
            }
          } else {
            for (let i = 0; i < -step; i += 1) {
              this.popLastPlateAppearance(gameId, paResult, side);
            }
          }
          const nextIndex = stepBatterIndex(log[indexCol], length, step);
          this.db.prepare(`UPDATE game_logs SET ${indexCol} = ? WHERE gameId = ?`).run(nextIndex, gameId);
          if (stat === 'hits') this.syncHitsFromPlays(gameId);
        }
      }
      this.db
        .prepare('UPDATE game_logs SET updatedAt = ?, updatedByUserId = ? WHERE gameId = ?')
        .run(now, userId, gameId);
    });
    tx();
    return this.getGame(gameId)!;
  }

  bumpCurrentOuts(gameId: string, delta: number, userId: string): GameLog {
    const game = this.getGame(gameId);
    if (!game) {
      throw new Error(`Unknown game: ${gameId}`);
    }
    const step = Math.trunc(delta);
    if (!Number.isFinite(step)) {
      throw new Error('delta must be a number');
    }
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.ensureGameLog(gameId);
      const log = this.getGameLog(gameId)!;
      const awayLen = this.lineupLength(gameId, game.awayTeamId);
      const homeLen = this.lineupLength(gameId, game.homeTeamId);
      if (step > 0) {
        let awayIndex = log.awayBatterIndex;
        let homeIndex = log.homeBatterIndex;
        let inning = log.currentInning;
        let half = log.currentHalf;
        let outs = log.currentOuts;
        for (let i = 0; i < step; i += 1) {
          const side = batterSide(half);
          this.creditBatter(game, side, 'out', side === 'home' ? homeIndex : awayIndex, inning, half);
          if (half === 'top') awayIndex = stepBatterIndex(awayIndex, awayLen, 1);
          else homeIndex = stepBatterIndex(homeIndex, homeLen, 1);
          const flipped = stepHalfInning(inning, half, outs, 1);
          inning = flipped.inning;
          half = flipped.half;
          outs = flipped.outs;
        }
      } else {
        for (let i = 0; i < -step; i += 1) {
          this.popLastPlateAppearance(gameId, 'out');
        }
      }
      const next = this.stepOutsAndBatters(log, awayLen, homeLen, step);
      const awayLine = lineForDisplay(log.awayLine, next.inning, log.homeLine);
      const homeLine = lineForDisplay(log.homeLine, next.inning, awayLine);
      this.db
        .prepare(
          `UPDATE game_logs SET currentOuts = ?, currentInning = ?, currentHalf = ?,
           awayBatterIndex = ?, homeBatterIndex = ?,
           awayLine = ?, homeLine = ?, updatedAt = ?, updatedByUserId = ? WHERE gameId = ?`,
        )
        .run(
          next.outs,
          next.inning,
          next.half,
          next.awayBatterIndex,
          next.homeBatterIndex,
          JSON.stringify(awayLine),
          JSON.stringify(homeLine),
          now,
          userId,
          gameId,
        );
    });
    tx();
    return this.getGameLog(gameId)!;
  }

  bumpInningRun(gameId: string, side: ScoreSide, inning: number, delta: number, userId: string): Game {
    const game = this.getGame(gameId);
    if (!game) {
      throw new Error(`Unknown game: ${gameId}`);
    }
    if (side !== 'home' && side !== 'away') {
      throw new Error('side must be home or away');
    }
    const step = Math.trunc(delta);
    if (!Number.isFinite(step) || step === 0) {
      return game;
    }
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.ensureGameLog(gameId);
      this.writeInningRun(gameId, side, inning, step, now, userId);
    });
    tx();
    return this.getGame(gameId)!;
  }

  private writeInningRun(
    gameId: string,
    side: ScoreSide,
    inning: number,
    step: number,
    now: string,
    userId: string,
  ): void {
    const log = this.getGameLog(gameId)!;
    const target = Math.max(1, Math.trunc(inning) || log.currentInning);
    const awayLine =
      side === 'away' ? bumpInningLine(log.awayLine, target, step) : lineForDisplay(log.awayLine, target, log.homeLine);
    const homeLine =
      side === 'home' ? bumpInningLine(log.homeLine, target, step) : lineForDisplay(log.homeLine, target, awayLine);
    const awayRuns = sumLine(awayLine);
    const homeRuns = sumLine(homeLine);
    this.db
      .prepare('UPDATE games SET homeScore = ?, awayScore = ?, played = 1 WHERE id = ?')
      .run(homeRuns, awayRuns, gameId);
    this.db
      .prepare(
        'UPDATE game_logs SET awayLine = ?, homeLine = ?, updatedAt = ?, updatedByUserId = ? WHERE gameId = ?',
      )
      .run(JSON.stringify(awayLine), JSON.stringify(homeLine), now, userId, gameId);
  }

  private ensureUserColumns(): void {
    const userCols = new Set(
      (this.db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map((c) => c.name),
    );
    if (!userCols.has('onRoster')) {
      this.db.exec('ALTER TABLE users ADD COLUMN onRoster INTEGER NOT NULL DEFAULT 1');
    }
    const extras: Array<[string, string]> = [
      ['skillLevel', 'TEXT'],
      ['phone', 'TEXT'],
      ['sharePhone', 'INTEGER NOT NULL DEFAULT 0'],
      ['waiverUrl', 'TEXT'],
      ['waiverStatus', "TEXT NOT NULL DEFAULT 'none'"],
      ['waiverReviewedBy', 'TEXT'],
      ['waiverReviewedAt', 'TEXT'],
    ];
    for (const [name, spec] of extras) {
      if (!userCols.has(name)) {
        this.db.exec(`ALTER TABLE users ADD COLUMN ${name} ${spec}`);
      }
    }
    const pendingCols = new Set(
      (this.db.prepare('PRAGMA table_info(pending_managers)').all() as Array<{ name: string }>).map((c) => c.name),
    );
    if (!pendingCols.has('onRoster')) {
      this.db.exec('ALTER TABLE pending_managers ADD COLUMN onRoster INTEGER NOT NULL DEFAULT 1');
    }
  }

  private ensureFaInvitesTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS fa_invites (
        id TEXT PRIMARY KEY,
        fromUserId TEXT NOT NULL,
        teamId TEXT NOT NULL,
        toUserId TEXT NOT NULL,
        gameId TEXT,
        week INTEGER,
        status TEXT NOT NULL,
        createdAt TEXT NOT NULL
      )
    `);
  }

  private ensurePlateAppearancesTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_plate_appearances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gameId TEXT NOT NULL,
        playerId TEXT NOT NULL,
        teamId TEXT NOT NULL,
        side TEXT NOT NULL,
        result TEXT NOT NULL,
        inning INTEGER,
        half TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pa_player ON game_plate_appearances (playerId);
      CREATE INDEX IF NOT EXISTS idx_pa_game ON game_plate_appearances (gameId);
    `);
    const master = this.db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'game_plate_appearances'`)
      .get() as { sql: string } | undefined;
    const cols = new Set(
      (this.db.prepare('PRAGMA table_info(game_plate_appearances)').all() as Array<{ name: string }>).map((c) => c.name),
    );
    const restrictive = Boolean(master?.sql?.includes('CHECK') && !master.sql.includes('single'));
    if (restrictive || !cols.has('inning') || !cols.has('half')) {
      this.rebuildPlateAppearancesTable();
    } else {
      this.db.prepare(`UPDATE game_plate_appearances SET result = 'single' WHERE result = 'hit'`).run();
    }
  }

  private rebuildPlateAppearancesTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_plate_appearances_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gameId TEXT NOT NULL,
        playerId TEXT NOT NULL,
        teamId TEXT NOT NULL,
        side TEXT NOT NULL,
        result TEXT NOT NULL,
        inning INTEGER,
        half TEXT,
        createdAt TEXT NOT NULL
      );
      INSERT INTO game_plate_appearances_v2 (id, gameId, playerId, teamId, side, result, inning, half, createdAt)
      SELECT id, gameId, playerId, teamId, side,
        CASE result WHEN 'hit' THEN 'single' ELSE result END,
        NULL, NULL, createdAt
      FROM game_plate_appearances;
      DROP TABLE game_plate_appearances;
      ALTER TABLE game_plate_appearances_v2 RENAME TO game_plate_appearances;
      CREATE INDEX IF NOT EXISTS idx_pa_player ON game_plate_appearances (playerId);
      CREATE INDEX IF NOT EXISTS idx_pa_game ON game_plate_appearances (gameId);
    `);
  }

  private lineupSlots(gameId: string, teamId: string): LineupPlayer[] {
    return this.getLineupSlots(gameId, teamId).slots;
  }

  private recordPlateAppearance(
    gameId: string,
    playerId: string,
    teamId: string,
    side: ScoreSide,
    result: StoredPlayResult,
    inning?: number | null,
    half?: InningHalf | null,
  ): void {
    this.db
      .prepare(
        `INSERT INTO game_plate_appearances (gameId, playerId, teamId, side, result, inning, half, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(gameId, playerId, teamId, side, result, inning ?? null, half ?? null, new Date().toISOString());
  }

  private popLastPlateAppearance(gameId: string, result: StoredPlayResult, side?: ScoreSide): void {
    const results =
      result === 'single'
        ? ['single', 'hit', 'double', 'triple', 'homer']
        : result === 'out'
          ? ['out', 'strikeout']
          : [result];
    const placeholders = results.map(() => '?').join(', ');
    const row = side
      ? (this.db
          .prepare(
            `SELECT id FROM game_plate_appearances
             WHERE gameId = ? AND result IN (${placeholders}) AND side = ?
             ORDER BY id DESC LIMIT 1`,
          )
          .get(gameId, ...results, side) as { id: number } | undefined)
      : (this.db
          .prepare(
            `SELECT id FROM game_plate_appearances
             WHERE gameId = ? AND result IN (${placeholders})
             ORDER BY id DESC LIMIT 1`,
          )
          .get(gameId, ...results) as { id: number } | undefined);
    if (row) this.db.prepare('DELETE FROM game_plate_appearances WHERE id = ?').run(row.id);
  }

  private creditBatter(
    game: Game,
    side: ScoreSide,
    result: StoredPlayResult,
    batterIndex: number,
    inning?: number | null,
    half?: InningHalf | null,
  ): void {
    const teamId = side === 'home' ? game.homeTeamId : game.awayTeamId;
    const slots = this.lineupSlots(game.id, teamId);
    if (slots.length === 0) return;
    const batter = slots[wrapBatterIndex(batterIndex, slots.length)];
    if (batter) this.recordPlateAppearance(game.id, batter.id, teamId, side, result, inning, half);
  }

  private syncHitsFromPlays(gameId: string): void {
    const rows = this.db
      .prepare(`SELECT side, result FROM game_plate_appearances WHERE gameId = ?`)
      .all(gameId) as Array<{ side: string; result: string }>;
    let homeHits = 0;
    let awayHits = 0;
    for (const row of rows) {
      const result = normalizePlayResult(row.result) ?? row.result;
      if (!isHitResult(result)) continue;
      if (row.side === 'home') homeHits += 1;
      else awayHits += 1;
    }
    this.db.prepare('UPDATE game_logs SET homeHits = ?, awayHits = ? WHERE gameId = ?').run(homeHits, awayHits, gameId);
  }

  listGamePlays(gameId: string): GamePlay[] {
    const rows = this.db
      .prepare(
        `SELECT pa.id, pa.playerId, pa.teamId, pa.side, pa.result, pa.inning, pa.half, pa.createdAt,
                COALESCE(u.name, p.name, 'Unknown') AS name
         FROM game_plate_appearances pa
         LEFT JOIN users u ON u.id = pa.playerId
         LEFT JOIN players p ON p.id = pa.playerId
         WHERE pa.gameId = ?
         ORDER BY pa.id ASC`,
      )
      .all(gameId) as Array<{
      id: number;
      playerId: string;
      teamId: string;
      side: string;
      result: string;
      inning: number | null;
      half: string | null;
      createdAt: string;
      name: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      playerId: row.playerId,
      name: row.name,
      result: (normalizePlayResult(row.result) ?? 'out') as StoredPlayResult,
      side: row.side === 'home' ? 'home' : 'away',
      inning: row.inning == null ? null : Math.max(1, clampStat(row.inning) || 1),
      half: row.half === 'bottom' ? 'bottom' : row.half === 'top' ? 'top' : null,
      createdAt: row.createdAt,
    }));
  }

  recordPlay(gameId: string, rawResult: unknown, userId: string): Game {
    const play = normalizePlayResult(rawResult);
    if (!play || !isLivePlayResult(play)) {
      throw new Error('Play must be single, double, triple, homer, out, or strikeout');
    }
    const game = this.getGame(gameId);
    if (!game) throw new Error(`Unknown game: ${gameId}`);
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.ensureGameLog(gameId);
      const log = this.getGameLog(gameId)!;
      const side = batterSide(log.currentHalf);
      const teamId = side === 'home' ? game.homeTeamId : game.awayTeamId;
      const slots = this.lineupSlots(gameId, teamId);
      if (slots.length === 0) {
        throw new Error("Set the batting team's lineup before recording plays.");
      }
      const awayLen = this.lineupLength(gameId, game.awayTeamId);
      const homeLen = this.lineupLength(gameId, game.homeTeamId);
      const index = side === 'home' ? log.homeBatterIndex : log.awayBatterIndex;
      this.creditBatter(game, side, play, index, log.currentInning, log.currentHalf);
      if (isHitResult(play)) {
        const length = side === 'home' ? homeLen : awayLen;
        const indexCol = side === 'home' ? 'homeBatterIndex' : 'awayBatterIndex';
        const nextIndex = stepBatterIndex(index, length, 1);
        this.db
          .prepare(`UPDATE game_logs SET ${indexCol} = ?, updatedAt = ?, updatedByUserId = ? WHERE gameId = ?`)
          .run(nextIndex, now, userId, gameId);
        this.syncHitsFromPlays(gameId);
      } else {
        const next = this.stepOutsAndBatters(log, awayLen, homeLen, 1);
        const awayLine = lineForDisplay(log.awayLine, next.inning, log.homeLine);
        const homeLine = lineForDisplay(log.homeLine, next.inning, awayLine);
        this.db
          .prepare(
            `UPDATE game_logs SET currentOuts = ?, currentInning = ?, currentHalf = ?,
             awayBatterIndex = ?, homeBatterIndex = ?,
             awayLine = ?, homeLine = ?, updatedAt = ?, updatedByUserId = ? WHERE gameId = ?`,
          )
          .run(
            next.outs,
            next.inning,
            next.half,
            next.awayBatterIndex,
            next.homeBatterIndex,
            JSON.stringify(awayLine),
            JSON.stringify(homeLine),
            now,
            userId,
            gameId,
          );
      }
    });
    tx();
    return this.getGame(gameId)!;
  }

  undoLastPlay(gameId: string, userId: string): Game {
    const game = this.getGame(gameId);
    if (!game) throw new Error(`Unknown game: ${gameId}`);
    const last = this.db
      .prepare(
        `SELECT id, side, result FROM game_plate_appearances WHERE gameId = ? ORDER BY id DESC LIMIT 1`,
      )
      .get(gameId) as { id: number; side: string; result: string } | undefined;
    if (!last) return game;
    const result = normalizePlayResult(last.result) ?? last.result;
    const side: ScoreSide = last.side === 'home' ? 'home' : 'away';
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.ensureGameLog(gameId);
      this.db.prepare('DELETE FROM game_plate_appearances WHERE id = ?').run(last.id);
      const log = this.getGameLog(gameId)!;
      const awayLen = this.lineupLength(gameId, game.awayTeamId);
      const homeLen = this.lineupLength(gameId, game.homeTeamId);
      if (isOutResult(result)) {
        const next = this.stepOutsAndBatters(log, awayLen, homeLen, -1);
        const awayLine = lineForDisplay(log.awayLine, next.inning, log.homeLine);
        const homeLine = lineForDisplay(log.homeLine, next.inning, awayLine);
        this.db
          .prepare(
            `UPDATE game_logs SET currentOuts = ?, currentInning = ?, currentHalf = ?,
             awayBatterIndex = ?, homeBatterIndex = ?,
             awayLine = ?, homeLine = ?, updatedAt = ?, updatedByUserId = ? WHERE gameId = ?`,
          )
          .run(
            next.outs,
            next.inning,
            next.half,
            next.awayBatterIndex,
            next.homeBatterIndex,
            JSON.stringify(awayLine),
            JSON.stringify(homeLine),
            now,
            userId,
            gameId,
          );
      } else if (isHitResult(result) || result === 'walk') {
        const length = side === 'home' ? homeLen : awayLen;
        const indexCol = side === 'home' ? 'homeBatterIndex' : 'awayBatterIndex';
        const nextIndex = stepBatterIndex(log[indexCol], length, -1);
        if (result === 'walk') {
          const walksCol = side === 'home' ? 'homeWalks' : 'awayWalks';
          const nextWalks = clampStat(Number(log[walksCol]) - 1);
          this.db
            .prepare(`UPDATE game_logs SET ${walksCol} = ?, ${indexCol} = ? WHERE gameId = ?`)
            .run(nextWalks, nextIndex, gameId);
        } else {
          this.db.prepare(`UPDATE game_logs SET ${indexCol} = ? WHERE gameId = ?`).run(nextIndex, gameId);
        }
        this.db
          .prepare('UPDATE game_logs SET updatedAt = ?, updatedByUserId = ? WHERE gameId = ?')
          .run(now, userId, gameId);
      }
      this.syncHitsFromPlays(gameId);
    });
    tx();
    return this.getGame(gameId)!;
  }

  private ensureGameLogColumns(): void {
    const cols = new Set(
      (this.db.prepare('PRAGMA table_info(game_logs)').all() as Array<{ name: string }>).map((c) => c.name),
    );
    const extras: Array<[string, string]> = [
      ['awayLine', "TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0]'"],
      ['homeLine', "TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0]'"],
      ['currentInning', 'INTEGER NOT NULL DEFAULT 1'],
      ['currentHalf', "TEXT NOT NULL DEFAULT 'top'"],
      ['awayBatterIndex', 'INTEGER NOT NULL DEFAULT 0'],
      ['homeBatterIndex', 'INTEGER NOT NULL DEFAULT 0'],
    ];
    for (const [name, spec] of extras) {
      if (!cols.has(name)) {
        this.db.exec(`ALTER TABLE game_logs ADD COLUMN ${name} ${spec}`);
      }
    }
  }

  private ensureGameLog(gameId: string): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO game_logs (
          gameId, homeHits, awayHits, homeWalks, awayWalks, homeOuts, awayOuts,
          currentOuts, awayLine, homeLine, currentInning, currentHalf,
          liveStartedAt, updatedAt, updatedByUserId
        ) VALUES (?, 0, 0, 0, 0, 0, 0, 0, ?, ?, 1, 'top', NULL, ?, NULL)`,
      )
      .run(gameId, JSON.stringify(emptyLine()), JSON.stringify(emptyLine()), new Date().toISOString());
  }

  getStandings(): StandingRow[] {
    const rows = new Map<string, StandingRow>();
    for (const team of this.db.prepare('SELECT id, name FROM teams').all() as Array<{ id: string; name: string }>) {
      rows.set(team.id, {
        teamId: team.id,
        teamName: team.name,
        wins: 0,
        losses: 0,
        ties: 0,
        runsFor: 0,
        runsAgainst: 0,
        gamesPlayed: 0,
      });
    }

    const games = this.db
      .prepare(
        'SELECT homeTeamId, awayTeamId, homeScore, awayScore, played FROM games',
      )
      .all() as Array<{
      homeTeamId: string;
      awayTeamId: string;
      homeScore: number | null;
      awayScore: number | null;
      played: number;
    }>;

    for (const game of games) {
      if (Number(game.played) !== 1 || game.homeScore === null || game.awayScore === null) continue;
      const home = rows.get(game.homeTeamId);
      const away = rows.get(game.awayTeamId);
      if (!home || !away) continue;

      home.gamesPlayed += 1;
      away.gamesPlayed += 1;
      home.runsFor += game.homeScore;
      home.runsAgainst += game.awayScore;
      away.runsFor += game.awayScore;
      away.runsAgainst += game.homeScore;

      if (game.homeScore > game.awayScore) {
        home.wins += 1;
        away.losses += 1;
      } else if (game.homeScore < game.awayScore) {
        away.wins += 1;
        home.losses += 1;
      } else {
        home.ties += 1;
        away.ties += 1;
      }
    }

    return [...rows.values()].sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      const aDiff = a.runsFor - a.runsAgainst;
      const bDiff = a.runsFor - a.runsAgainst;
      if (bDiff !== aDiff) return bDiff - aDiff;
      return a.teamName.localeCompare(b.teamName);
    });
  }

  createTeam(name: string): Team {
    const trimmed = (name ?? '').trim();
    if (!trimmed) throw new Error('Team name is required');
    const id =
      trimmed
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || `team${Date.now()}`;
    const existing = this.db.prepare('SELECT id FROM teams WHERE id = ?').get(id);
    if (existing) {
      throw new Error('A team with a similar name already exists');
    }
    const team: Team = { id, name: trimmed };
    this.db.prepare('INSERT INTO teams (id, name, photoUrl) VALUES (?, ?, NULL)').run(id, trimmed);
    return team;
  }

  /** Update a team's display name. The id stays stable so player/game refs remain valid. */
  renameTeam(teamId: string, name: string): Team {
    const trimmed = (name ?? '').trim();
    if (!trimmed) throw new Error('Team name is required');
    const team = this.getTeam(teamId);
    if (!team) throw new Error(`Unknown team: ${teamId}`);
    this.db.prepare('UPDATE teams SET name = ? WHERE id = ?').run(trimmed, teamId);
    team.name = trimmed;
    return team;
  }

  /** Set or clear a team's photo (data:image URL, max 800000 chars). */
  setTeamPhoto(teamId: string, photoUrl: string | null): Team {
    const team = this.getTeam(teamId);
    if (!team) throw new Error(`Unknown team: ${teamId}`);
    const normalized = normalizePhotoUrl(photoUrl);
    this.db.prepare('UPDATE teams SET photoUrl = ? WHERE id = ?').run(normalized, teamId);
    if (normalized) team.photoUrl = normalized;
    else delete team.photoUrl;
    return team;
  }

  removePlayer(playerId: string): void {
    const result = this.db.prepare('DELETE FROM players WHERE id = ?').run(playerId);
    if (result.changes === 0) {
      throw new Error(`Unknown player: ${playerId}`);
    }
  }

  getPlayer(playerId: string): Player | undefined {
    const row = this.db
      .prepare('SELECT id, teamId, name, number, position FROM players WHERE id = ?')
      .get(playerId) as PlayerRow | undefined;
    return row ? playerFromRow(row) : undefined;
  }

  getGame(gameId: string): Game | undefined {
    const row = this.db
      .prepare(
        'SELECT id, date, homeTeamId, awayTeamId, homeScore, awayScore, played, field, time, location, week FROM games WHERE id = ?',
      )
      .get(gameId) as GameRow | undefined;
    return row ? gameFromRow(row) : undefined;
  }

  // ---- Users & auth ------------------------------------------------------

  listUsers(): PublicUser[] {
    const rows = this.db.prepare('SELECT * FROM users').all() as UserRow[];
    return rows
      .map(userFromRow)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toPublicUser);
  }

  getUserById(id: string): User | undefined {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? userFromRow(row) : undefined;
  }

  getUserByEmail(email: string): User | undefined {
    const normalized = email.trim().toLowerCase();
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(normalized) as UserRow | undefined;
    return row ? userFromRow(row) : undefined;
  }

  registerUser(input: { email: string; name: string; password: string; role?: Role; teamId?: string | null }): PublicUser {
    const email = (input.email ?? '').trim().toLowerCase();
    const name = (input.name ?? '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('A valid email is required');
    if (!name) throw new Error('Name is required');
    if (!input.password || input.password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
    if (this.getUserByEmail(email)) throw new Error('An account with that email already exists');

    const user: User = {
      id: `u${Date.now()}${Math.floor(Math.random() * 1000)}`,
      email,
      name,
      role: input.role ?? 'player',
      teamId: input.role === 'manager' ? input.teamId ?? null : null,
      onRoster: true,
      passwordHash: hashPassword(input.password),
      createdAt: new Date().toISOString(),
      sharePhone: false,
      waiverStatus: 'none',
    };

    this.db.prepare('DELETE FROM pending_managers WHERE email = ?').run(email);

    this.insertUserRow(user);
    return toPublicUser(user);
  }

  authenticate(email: string, password: string): PublicUser | null {
    const user = this.getUserByEmail(email ?? '');
    if (!user) return null;
    if (!verifyPassword(password ?? '', user.passwordHash)) return null;
    return toPublicUser(user);
  }

  /**
   * Assign a role. Managers can only be promoted from an existing player
   * account (or reassigned if they are already a manager). They are pinned
   * to a team and, by default, play for that same team. Pass `onRoster: false`
   * for manager-only (off the roster).
   */
  setUserRole(userId: string, role: Role, teamId: string | null = null, onRoster?: boolean): PublicUser {
    const user = this.getUserById(userId);
    if (!user) throw new Error('Unknown user');
    if (role === 'admin') {
      if (user.role === 'admin') return toPublicUser(user);
      throw new Error('Admin access cannot be granted');
    }
    if (role === 'manager') {
      if (user.role !== 'player' && user.role !== 'manager') {
        throw new Error('Managers can only be promoted from a player account');
      }
      if (!teamId || !this.getTeam(teamId)) throw new Error('A valid team is required for managers');
      const alreadyHere = user.role === 'manager' && user.teamId === teamId;
      if (!alreadyHere && this.getTeamManagers(teamId).length >= MANAGERS_PER_TEAM) {
        throw new Error(`This team already has ${MANAGERS_PER_TEAM} managers`);
      }
      user.teamId = teamId;
      user.onRoster = onRoster === undefined ? (user.role === 'manager' ? user.onRoster !== false : true) : onRoster;
    } else {
      user.teamId = null;
      user.onRoster = true;
    }
    user.role = role;
    this.updateUserRow(user);
    return toPublicUser(user);
  }

  toPublicUser(user: User): PublicUser {
    return toPublicUser(user);
  }

  /**
   * Set a player account's team association. Only player-role users can be
   * attached to (or detached from) a team this way.
   */
  setUserTeam(userId: string, teamId: string | null): PublicUser {
    const user = this.getUserById(userId);
    if (!user) throw new Error('Unknown user');
    if (user.role === 'manager') {
      throw new Error('Managers play for the team they manage');
    }
    if (user.role !== 'player') {
      throw new Error('Only player accounts can join a team');
    }
    if (teamId !== null) {
      if (typeof teamId !== 'string' || !teamId) throw new Error('Unknown team');
      if (!this.getTeam(teamId)) throw new Error(`Unknown team: ${teamId}`);
    }
    user.teamId = teamId;
    this.updateUserRow(user);
    return toPublicUser(user);
  }

  /**
   * Upcoming/in-progress week: smallest scheduled week whose game date is >=
   * today's UTC date. After the season ends, returns the last week. No games → null.
   */
  getCurrentWeek(): CurrentWeek | null {
    const rows = this.db
      .prepare('SELECT week, MIN(date) AS date FROM games GROUP BY week ORDER BY week ASC')
      .all() as Array<{ week: number; date: string }>;
    if (rows.length === 0) return null;
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = rows.find((row) => row.date >= today);
    if (upcoming) return { week: upcoming.week, date: upcoming.date };
    const last = rows[rows.length - 1];
    return { week: last.week, date: last.date };
  }

  getCheckInsForWeek(week: number): Map<string, CheckInStatus> {
    const rows = this.db
      .prepare('SELECT userId, week, status FROM check_ins WHERE week = ?')
      .all(week) as CheckInRow[];
    const map = new Map<string, CheckInStatus>();
    for (const row of rows) {
      if (row.status === 'in' || row.status === 'out') {
        map.set(row.userId, row.status);
      }
    }
    return map;
  }

  getUserCheckIns(userId: string): Map<number, CheckInStatus> {
    const rows = this.db
      .prepare('SELECT week, status FROM check_ins WHERE userId = ?')
      .all(userId) as CheckInRow[];
    const map = new Map<number, CheckInStatus>();
    for (const row of rows) {
      if (row.status === 'in' || row.status === 'out') {
        map.set(row.week, row.status);
      }
    }
    return map;
  }

  /**
   * Account members of a team for attendance: player-role users with
   * `teamId === team` plus playing managers. Manager-only accounts are
   * excluded. Manual placeholder roster rows have no account and are excluded
   * (same set as `getTeamMembers`).
   */
  getTeamAttendance(teamId: string, week: number): TeamAttendance {
    const members = this.accountMemberIdsByTeam().get(teamId) ?? [];
    return tallyAttendance(members, this.getCheckInsForWeek(week));
  }

  /**
   * Attendance for both sides of every game, keyed by `${teamId}:${week}`.
   * Loads account members and check-ins once so schedule payloads stay O(1)
   * extra queries regardless of weeks/teams.
   */
  getAttendanceForGames(
    games: Array<{ homeTeamId: string; awayTeamId: string; week: number }>,
  ): Map<string, TeamAttendance> {
    const membersByTeam = this.accountMemberIdsByTeam();
    const checkInsByWeek = this.checkInsByWeek();
    const out = new Map<string, TeamAttendance>();
    for (const game of games) {
      for (const teamId of [game.homeTeamId, game.awayTeamId]) {
        const key = `${teamId}:${game.week}`;
        if (out.has(key)) continue;
        const members = membersByTeam.get(teamId) ?? [];
        const checkIns = checkInsByWeek.get(game.week) ?? new Map<string, CheckInStatus>();
        out.set(key, members.length === 0 ? { ...EMPTY_ATTENDANCE } : tallyAttendance(members, checkIns));
      }
    }
    return out;
  }

  /** Playing player + manager account ids grouped by teamId. */
  private accountMemberIdsByTeam(): Map<string, string[]> {
    const rows = this.db.prepare('SELECT * FROM users').all() as UserRow[];
    const byTeam = new Map<string, string[]>();
    for (const user of rows.map(userFromRow)) {
      if (!userOnRoster(user) || !user.teamId) continue;
      const list = byTeam.get(user.teamId) ?? [];
      list.push(user.id);
      byTeam.set(user.teamId, list);
    }
    return byTeam;
  }

  private checkInsByWeek(): Map<number, Map<string, CheckInStatus>> {
    const rows = this.db.prepare('SELECT userId, week, status FROM check_ins').all() as CheckInRow[];
    const byWeek = new Map<number, Map<string, CheckInStatus>>();
    for (const row of rows) {
      if (row.status !== 'in' && row.status !== 'out') continue;
      let weekMap = byWeek.get(row.week);
      if (!weekMap) {
        weekMap = new Map();
        byWeek.set(row.week, weekMap);
      }
      weekMap.set(row.userId, row.status);
    }
    return byWeek;
  }

  /**
   * Set (or clear) a user's check-in for a scheduled week. The user must exist
   * and already be on a team; `week` must appear on the schedule.
   */
  setCheckIn(userId: string, week: number, status: CheckInStatus | null): CheckInStatus | null {
    const user = this.getUserById(userId);
    if (!user) throw new Error('Unknown user');
    if (!user.teamId) throw new Error('You must be on a team to check in');
    if (!userOnRoster(user)) throw new Error('Manager-only accounts are not on the roster');
    if (!Number.isInteger(week)) throw new Error('week is not a scheduled week');
    const scheduled = this.db.prepare('SELECT 1 AS ok FROM games WHERE week = ? LIMIT 1').get(week) as
      | { ok: number }
      | undefined;
    if (!scheduled) throw new Error('week is not a scheduled week');
    if (status !== 'in' && status !== 'out' && status !== null) {
      throw new Error("status must be 'in', 'out', or null");
    }

    if (status === null) {
      this.db.prepare('DELETE FROM check_ins WHERE userId = ? AND week = ?').run(userId, week);
      return null;
    }

    this.db
      .prepare(
        `INSERT INTO check_ins (userId, week, status) VALUES (?, ?, ?)
         ON CONFLICT(userId, week) DO UPDATE SET status = excluded.status`,
      )
      .run(userId, week, status);
    return status;
  }

  /**
   * Playing accounts on this team, public-safe (no email). Playing managers
   * sort first; manager-only accounts are omitted (they still appear as
   * `getTeamManager`). Then by number, then name.
   * `checkIn` is the member's RSVP for the current week (null = no response).
   */
  getTeamMembers(teamId: string): TeamMember[] {
    const current = this.getCurrentWeek();
    const checkIns = current ? this.getCheckInsForWeek(current.week) : new Map<string, CheckInStatus>();
    const rows = this.db.prepare('SELECT * FROM users').all() as UserRow[];
    return rows
      .map(userFromRow)
      .filter((u) => userOnRoster(u) && u.teamId === teamId)
      .map(
        (u): TeamMember => ({
          id: u.id,
          name: u.name,
          number: u.number ?? null,
          position: u.position,
          photoUrl: u.photoUrl,
          isManager: u.role === 'manager',
          checkIn: checkIns.get(u.id) ?? null,
          skillLevel: u.skillLevel ?? null,
          waiverStatus: u.waiverStatus,
        }),
      )
      .sort((a, b) => {
        if (a.isManager !== b.isManager) return a.isManager ? -1 : 1;
        const aHas = a.number != null;
        const bHas = b.number != null;
        if (aHas && bHas && a.number !== b.number) return a.number! - b.number!;
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
        return a.name.localeCompare(b.name);
      });
  }

  /** All player-role accounts as a picker list (no email). */
  listPlayerAccounts(): PlayerAccount[] {
    const rows = this.db.prepare('SELECT * FROM users').all() as UserRow[];
    return rows
      .map(userFromRow)
      .filter((u) => u.role === 'player')
      .map((u) => ({ id: u.id, name: u.name, teamId: u.teamId }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Manager-role users assigned to this team. Name only — never email. */
  getTeamManagers(teamId: string): TeamManagerSummary[] {
    const rows = this.db.prepare('SELECT * FROM users ORDER BY rowid').all() as UserRow[];
    return rows
      .map(userFromRow)
      .filter((u) => u.role === 'manager' && u.teamId === teamId)
      .map((u) => ({ name: u.name, onRoster: u.onRoster !== false }));
  }

  /** First manager on this team, or null. Name only — never email. */
  getTeamManager(teamId: string): TeamManagerSummary | null {
    return this.getTeamManagers(teamId)[0] ?? null;
  }

  /**
   * Promote existing player accounts (or reassign current managers) to
   * `teamId`. Unknown emails and non-player accounts are skipped — managers
   * are never created at signup.
   */
  authorizeManagers(
    emails: string[],
    teamId: string,
    onRoster = true,
  ): { promoted: string[]; skipped: string[] } {
    if (!this.getTeam(teamId)) throw new Error(`Unknown team: ${teamId}`);
    const plays = onRoster !== false;
    const promoted: string[] = [];
    const skipped: string[] = [];
    const seen = new Set<string>();

    const tx = this.db.transaction(() => {
      for (const raw of emails) {
        const email = (raw ?? '').trim().toLowerCase();
        if (!email) continue;
        if (seen.has(email)) continue;
        seen.add(email);

        const existing = this.getUserByEmail(email);
        if (!existing || (existing.role !== 'player' && existing.role !== 'manager')) {
          skipped.push(email);
          continue;
        }
        const alreadyHere = existing.role === 'manager' && existing.teamId === teamId;
        if (!alreadyHere && this.getTeamManagers(teamId).length >= MANAGERS_PER_TEAM) {
          skipped.push(email);
          continue;
        }
        this.setUserRole(existing.id, 'manager', teamId, plays);
        this.db.prepare('DELETE FROM pending_managers WHERE email = ?').run(email);
        promoted.push(email);
      }
    });
    tx();
    return { promoted, skipped };
  }

  /** Active managers for the admin list. Pending email invites are unused. */
  listManagerAuthorizations(): ManagerAuthorization[] {
    const rows: ManagerAuthorization[] = [];

    const users = (this.db.prepare('SELECT * FROM users').all() as UserRow[]).map(userFromRow);
    for (const user of users) {
      if (user.role !== 'manager' || !user.teamId) continue;
      const team = this.getTeam(user.teamId);
      rows.push({
        email: user.email,
        teamId: user.teamId,
        teamName: team?.name ?? user.teamId,
        status: 'active',
        onRoster: user.onRoster !== false,
      });
    }

    return rows.sort((a, b) => a.email.localeCompare(b.email));
  }

  /**
   * Drop a pending authorization. If an active manager uses this email, demote
   * them to player while keeping their teamId (they remain on the roster).
   */
  revokeManagerAuthorization(email: string): { ok: true } {
    const normalized = (email ?? '').trim().toLowerCase();
    this.db.prepare('DELETE FROM pending_managers WHERE email = ?').run(normalized);
    const user = this.getUserByEmail(normalized);
    if (user && user.role === 'manager') {
      user.role = 'player';
      this.updateUserRow(user);
    }
    return { ok: true };
  }

  /**
   * Update the signed-in user's own profile. Name is required; position, jersey
   * number, and photoUrl are optional. photoUrl must be a data:image URL ≤ 800000 chars.
   */
  updateProfile(
    userId: string,
    input: {
      name: string;
      position?: string;
      number?: number | null;
      photoUrl?: string | null;
      onRoster?: boolean;
      skillLevel?: SkillLevel | null;
      phone?: string | null;
      sharePhone?: boolean;
      waiverUrl?: string | null;
    },
  ): PublicUser {
    const user = this.getUserById(userId);
    if (!user) throw new Error('Unknown user');
    const name = (input.name ?? '').trim();
    if (!name) throw new Error('Name is required');
    user.name = name;
    if (input.onRoster !== undefined) {
      if (user.role !== 'manager') throw new Error('Only managers can change roster status');
      user.onRoster = input.onRoster !== false;
    }
    if (input.position !== undefined) {
      const position = (input.position ?? '').trim();
      if (position) user.position = position;
      else delete user.position;
    }
    if (input.number !== undefined) {
      user.number = normalizeJerseyNumber(input.number);
    }
    if (input.photoUrl !== undefined) {
      const photo = normalizePhotoUrl(input.photoUrl);
      if (photo) user.photoUrl = photo;
      else delete user.photoUrl;
    }
    if (input.skillLevel !== undefined) {
      user.skillLevel = normalizeSkillLevel(input.skillLevel);
    }
    if (input.phone !== undefined) {
      user.phone = normalizePhone(input.phone);
    }
    if (input.sharePhone !== undefined) {
      user.sharePhone = input.sharePhone === true;
    }
    if (input.waiverUrl !== undefined) {
      const waiver = normalizeWaiverUrl(input.waiverUrl);
      user.waiverUrl = waiver;
      if (waiver) {
        user.waiverStatus = 'pending';
        user.waiverReviewedBy = null;
        user.waiverReviewedAt = null;
      } else {
        user.waiverStatus = 'none';
        user.waiverReviewedBy = null;
        user.waiverReviewedAt = null;
      }
    }
    this.updateUserRow(user);
    return toPublicUser(user);
  }

  getPlayerStats(userId: string): PlayerStats {
    return this.getPlayerStatsMap([userId]).get(userId) ?? emptyBattingLine();
  }

  getPlayerStatsMap(playerIds: string[]): Map<string, PlayerBattingLine> {
    const unique = [...new Set(playerIds.filter(Boolean))];
    const map = new Map<string, PlayerBattingLine>();
    for (const id of unique) map.set(id, emptyBattingLine());
    if (unique.length === 0) return map;
    const placeholders = unique.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT playerId, gameId, result FROM game_plate_appearances WHERE playerId IN (${placeholders})`,
      )
      .all(...unique) as Array<{ playerId: string; gameId: string; result: string }>;
    const byPlayer = new Map<string, Array<{ gameId: string; result: string }>>();
    for (const row of rows) {
      const list = byPlayer.get(row.playerId) ?? [];
      list.push({ gameId: row.gameId, result: row.result });
      byPlayer.set(row.playerId, list);
    }
    for (const [id, list] of byPlayer) {
      map.set(id, tallyBattingLine(list));
    }
    return map;
  }

  getPublicPlayer(userId: string, viewer?: PublicUser | null): PublicPlayerProfile | null {
    const user = this.getUserById(userId);
    if (!user || user.role === 'admin') return null;
    const team = user.teamId ? this.getTeam(user.teamId) : undefined;
    const review = canReviewWaiver(viewer, user);
    const seePhone = canSeePhone(viewer, user);
    return {
      id: user.id,
      name: user.name,
      number: user.number ?? null,
      position: user.position,
      photoUrl: user.photoUrl,
      skillLevel: user.skillLevel ?? null,
      teamId: user.teamId,
      teamName: team?.name ?? null,
      isManager: user.role === 'manager',
      waiverStatus: user.waiverStatus,
      waiverUrl: review || viewer?.id === user.id ? user.waiverUrl ?? null : null,
      canReviewWaiver: review,
      phone: seePhone ? user.phone ?? null : null,
      sharePhone: user.sharePhone === true,
      canSeePhone: seePhone,
      stats: this.getPlayerStats(user.id),
    };
  }

  reviewWaiver(actor: PublicUser, targetId: string, status: 'approved' | 'rejected'): PublicPlayerProfile {
    const target = this.getUserById(targetId);
    if (!target || target.role === 'admin') throw new Error('Unknown player');
    if (!canReviewWaiver(actor, target)) {
      throw new Error('You can only review waivers for your team or free agents');
    }
    if (!target.waiverUrl) throw new Error('This player has not uploaded a waiver');
    target.waiverStatus = status;
    target.waiverReviewedBy = actor.id;
    target.waiverReviewedAt = new Date().toISOString();
    this.updateUserRow(target);
    const profile = this.getPublicPlayer(target.id, actor);
    if (!profile) throw new Error('Unknown player');
    return profile;
  }

  listPendingWaivers(viewer: PublicUser): PublicPlayerProfile[] {
    const rows = this.db.prepare('SELECT * FROM users').all() as UserRow[];
    return rows
      .map(userFromRow)
      .filter((u) => u.role !== 'admin' && u.waiverStatus === 'pending' && canReviewWaiver(viewer, u))
      .map((u) => this.getPublicPlayer(u.id, viewer)!)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private pendingInviteeIds(teamId: string): Set<string> {
    const rows = this.db
      .prepare("SELECT toUserId FROM fa_invites WHERE teamId = ? AND status = 'pending'")
      .all(teamId) as Array<{ toUserId: string }>;
    return new Set(rows.map((r) => r.toUserId));
  }

  private faInviteFromRow(row: FaInviteRow): FaInvite {
    const from = this.getUserById(row.fromUserId);
    const to = this.getUserById(row.toUserId);
    const team = this.getTeam(row.teamId);
    const game = row.gameId ? this.getGame(row.gameId) : undefined;
    return {
      id: row.id,
      fromUserId: row.fromUserId,
      fromName: from?.name ?? 'Manager',
      teamId: row.teamId,
      teamName: team?.name ?? row.teamId,
      toUserId: row.toUserId,
      toName: to?.name ?? 'Player',
      gameId: row.gameId,
      week: row.week,
      field: game?.field ?? null,
      time: game?.time ?? null,
      status: row.status as FaInviteStatus,
      createdAt: row.createdAt,
    };
  }

  listFaInvites(viewer: PublicUser): FaInvite[] {
    const rows =
      viewer.role === 'admin'
        ? (this.db.prepare('SELECT * FROM fa_invites ORDER BY createdAt DESC').all() as FaInviteRow[])
        : viewer.role === 'manager' && viewer.teamId
          ? (this.db
              .prepare('SELECT * FROM fa_invites WHERE teamId = ? OR toUserId = ? ORDER BY createdAt DESC')
              .all(viewer.teamId, viewer.id) as FaInviteRow[])
          : (this.db
              .prepare('SELECT * FROM fa_invites WHERE toUserId = ? ORDER BY createdAt DESC')
              .all(viewer.id) as FaInviteRow[]);
    return rows.map((row) => this.faInviteFromRow(row));
  }

  createFaInvite(actor: PublicUser, toUserId: string): FaInvite {
    if (actor.role !== 'manager' || !actor.teamId) {
      throw new Error('Only team managers can invite free agents');
    }
    const target = this.getUserById(toUserId);
    if (!target || target.role !== 'player') throw new Error('Unknown free agent');
    if (target.teamId) throw new Error('That player is already on a team');
    const existing = this.db
      .prepare("SELECT id FROM fa_invites WHERE teamId = ? AND toUserId = ? AND status = 'pending'")
      .get(actor.teamId, toUserId) as { id: string } | undefined;
    if (existing) throw new Error('You already invited this player');
    const weekGame = this.weekGamesByTeam().get(actor.teamId) ?? null;
    const id = `inv${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO fa_invites (id, fromUserId, teamId, toUserId, gameId, week, status, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(id, actor.id, actor.teamId, toUserId, weekGame?.id ?? null, weekGame ? this.getCurrentWeek()?.week ?? null : null, createdAt);
    return this.faInviteFromRow(
      this.db.prepare('SELECT * FROM fa_invites WHERE id = ?').get(id) as FaInviteRow,
    );
  }

  respondFaInvite(actor: PublicUser, inviteId: string, accept: boolean): FaInvite {
    const row = this.db.prepare('SELECT * FROM fa_invites WHERE id = ?').get(inviteId) as FaInviteRow | undefined;
    if (!row) throw new Error('Invite not found');
    if (row.toUserId !== actor.id) throw new Error('This invite is not for you');
    if (row.status !== 'pending') throw new Error('This invite is no longer open');
    const target = this.getUserById(actor.id);
    if (!target) throw new Error('Unknown user');
    if (accept) {
      if (target.teamId && target.teamId !== row.teamId) {
        throw new Error('Leave your current team before accepting');
      }
      this.setUserTeam(actor.id, row.teamId);
      this.db.prepare("UPDATE fa_invites SET status = 'accepted' WHERE id = ?").run(inviteId);
    } else {
      this.db.prepare("UPDATE fa_invites SET status = 'declined' WHERE id = ?").run(inviteId);
    }
    return this.faInviteFromRow(
      this.db.prepare('SELECT * FROM fa_invites WHERE id = ?').get(inviteId) as FaInviteRow,
    );
  }

  cancelFaInvite(actor: PublicUser, inviteId: string): FaInvite {
    const row = this.db.prepare('SELECT * FROM fa_invites WHERE id = ?').get(inviteId) as FaInviteRow | undefined;
    if (!row) throw new Error('Invite not found');
    const owns = actor.role === 'admin' || (actor.role === 'manager' && actor.teamId === row.teamId);
    if (!owns) throw new Error('You can only cancel your team invites');
    if (row.status !== 'pending') throw new Error('This invite is no longer open');
    this.db.prepare("UPDATE fa_invites SET status = 'cancelled' WHERE id = ?").run(inviteId);
    return this.faInviteFromRow(
      this.db.prepare('SELECT * FROM fa_invites WHERE id = ?').get(inviteId) as FaInviteRow,
    );
  }

  /** Ensure an admin account exists (bootstrapped from env at startup). */
  ensureAdmin(email: string, name: string, password: string): PublicUser {
    return this.ensureUser({ email, name, password, role: 'admin', teamId: null });
  }

  /**
   * Create a user if missing, or align an existing account's role/teamId.
   * Passwords are hashed on create; an existing user's password is left alone.
   */
  ensureUser(input: {
    email: string;
    name: string;
    password: string;
    role: Role;
    teamId?: string | null;
  }): PublicUser {
    const desiredTeamId = input.role === 'manager' ? input.teamId ?? null : null;
    const existing = this.getUserByEmail(input.email);
    if (existing) {
      if (input.role === 'admin') {
        if (existing.role !== 'admin') {
          existing.role = 'admin';
          existing.teamId = null;
          existing.onRoster = true;
          this.updateUserRow(existing);
        }
        return toPublicUser(existing);
      }
      if (existing.role !== input.role || existing.teamId !== desiredTeamId) {
        return this.setUserRole(existing.id, input.role, desiredTeamId);
      }
      return toPublicUser(existing);
    }
    return this.registerUser({
      email: input.email,
      name: input.name,
      password: input.password,
      role: input.role,
      teamId: desiredTeamId,
    });
  }

  // ---- Suggestions (public submit; admin reads) --------------------------

  addSuggestion(input: { text: unknown; authorName?: string | null }): Suggestion {
    if (typeof input.text !== 'string') throw new Error('text is required');
    const text = clampText(input.text.trim(), MAX_SUGGESTION_CHARS);
    if (!text) throw new Error('text is required');
    let authorName: string | null = null;
    if (typeof input.authorName === 'string') {
      const trimmed = input.authorName.trim();
      authorName = trimmed ? clampText(trimmed, 80) : null;
    }
    const suggestion: Suggestion = {
      id: newRowId('s'),
      text,
      authorName,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        'INSERT INTO suggestions (id, text, authorName, createdAt) VALUES (@id, @text, @authorName, @createdAt)',
      )
      .run(suggestion);
    return suggestion;
  }

  listSuggestions(): Suggestion[] {
    const rows = this.db
      .prepare('SELECT id, text, authorName, createdAt FROM suggestions ORDER BY createdAt DESC, rowid DESC')
      .all() as SuggestionRow[];
    return rows.map(suggestionFromRow);
  }

  deleteSuggestion(id: string): void {
    const result = this.db.prepare('DELETE FROM suggestions WHERE id = ?').run(id);
    if (result.changes === 0) {
      throw new Error(`Unknown suggestion: ${id}`);
    }
  }

  // ---- Team group chat ---------------------------------------------------

  getTeamMessages(teamId: string, limit = 200): TeamMessage[] {
    const cap = Number.isFinite(limit) ? Math.max(1, Math.min(Math.trunc(limit), 500)) : 200;
    const rows = this.db
      .prepare(
        `SELECT id, teamId, userId, authorName, text, createdAt
         FROM messages
         WHERE teamId = ?
         ORDER BY createdAt DESC, rowid DESC
         LIMIT ?`,
      )
      .all(teamId, cap) as MessageRow[];
    return rows.map(messageFromRow).reverse();
  }

  addTeamMessage(input: { teamId: string; userId: string; authorName: string; text: unknown }): TeamMessage {
    if (typeof input.text !== 'string') throw new Error('text is required');
    const text = clampText(input.text.trim(), MAX_MESSAGE_CHARS);
    if (!text) throw new Error('text is required');
    const authorName = clampText((input.authorName ?? '').trim() || 'Anonymous', 80);
    const message: TeamMessage = {
      id: newRowId('m'),
      teamId: input.teamId,
      userId: input.userId,
      authorName,
      text,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO messages (id, teamId, userId, authorName, text, createdAt)
         VALUES (@id, @teamId, @userId, @authorName, @text, @createdAt)`,
      )
      .run(message);
    return message;
  }

  // ---- TEST DATA (simulation) --------------------------------------------
  // Admin-only utility. Guests use the @sim.local domain so they are easy
  // to find and wipe without touching real/demo accounts or league config.

  private listSimUsers(): User[] {
    const rows = this.db
      .prepare('SELECT * FROM users WHERE email LIKE ?')
      .all(`%${SIM_EMAIL_DOMAIN}`) as UserRow[];
    return rows.map(userFromRow).filter((u) => u.email.endsWith(SIM_EMAIL_DOMAIN));
  }

  private emptyGenerateSummary(alreadySeeded: boolean): TestDataGenerateSummary {
    return {
      alreadySeeded,
      guestsCreated: 0,
      rosteredPlayers: 0,
      freeAgents: 0,
      checkIns: 0,
      messages: 0,
      gamesPlayed: 0,
      invites: 0,
    };
  }

  private seedSimGame(
    game: Game,
    guestsByTeam: Map<string, User[]>,
    homeScore: number,
    awayScore: number,
    rng: () => number,
    actorId: string,
  ): void {
    this.ensureGameLog(game.id);
    const lineups = new Map<string, User[]>();
    for (const side of ['home', 'away'] as const) {
      const teamId = side === 'home' ? game.homeTeamId : game.awayTeamId;
      const players = guestsByTeam.get(teamId) ?? [];
      if (players.length === 0) continue;
      const lineup = rotateLineup(players, game.week, FULL_LINEUP_SIZE);
      this.setGameLineup(
        game.id,
        teamId,
        lineup.map((player) => player.id),
        actorId,
      );
      lineups.set(teamId, lineup);
    }
    this.startLiveGame(game.id, actorId);

    const tally = {
      home: { hits: 0, walks: 0, outs: 0 },
      away: { hits: 0, walks: 0, outs: 0 },
    };
    for (let inning = 1; inning <= 7; inning += 1) {
      for (const half of ['top', 'bottom'] as const) {
        const side = half === 'top' ? 'away' : 'home';
        const teamId = side === 'home' ? game.homeTeamId : game.awayTeamId;
        const lineup = lineups.get(teamId) ?? [];
        if (lineup.length === 0) continue;
        const score = side === 'home' ? homeScore : awayScore;
        const targetHits = Math.max(1, Math.round(score / 7) + (rng() < 0.4 ? 1 : 0));
        let hits = 0;
        let outs = 0;
        let batter = (inning - 1) * 3;
        while (outs < 3) {
          const roll = rng();
          let result: StoredPlayResult;
          if (hits < targetHits && roll < 0.38) {
            result = pickSimHit(rng);
            hits += 1;
            tally[side].hits += 1;
          } else if (roll < 0.46) {
            result = 'walk';
            tally[side].walks += 1;
          } else {
            result = pickSimOut(rng);
            outs += 1;
            tally[side].outs += 1;
          }
          this.recordPlateAppearance(
            game.id,
            lineup[batter % lineup.length].id,
            teamId,
            side,
            result,
            inning,
            half,
          );
          batter += 1;
        }
      }
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE game_logs SET homeHits = ?, awayHits = ?, homeWalks = ?, awayWalks = ?,
         homeOuts = ?, awayOuts = ?, currentInning = 8, currentHalf = 'top', currentOuts = 0,
         liveStartedAt = COALESCE(liveStartedAt, ?), updatedAt = ?, updatedByUserId = ?
         WHERE gameId = ?`,
      )
      .run(
        tally.home.hits,
        tally.away.hits,
        tally.home.walks,
        tally.away.walks,
        tally.home.outs,
        tally.away.outs,
        now,
        now,
        actorId,
        game.id,
      );
  }

  private seedSimInvites(guests: User[]): number {
    const freeAgents = guests.filter((guest) => !guest.teamId);
    if (freeAgents.length === 0) return 0;
    const managers = this.listUsers().filter((user) => user.role === 'manager' && user.teamId);
    if (managers.length === 0) return 0;
    const week = this.getCurrentWeek();
    const weekGames = this.weekGamesByTeam();
    const insert = this.db.prepare(
      `INSERT INTO fa_invites (id, fromUserId, teamId, toUserId, gameId, week, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const statuses: Array<'pending' | 'declined' | 'cancelled'> = ['pending', 'declined', 'cancelled'];
    let invites = 0;
    for (let i = 0; i < freeAgents.length; i += 1) {
      const manager = managers[i % managers.length];
      if (!manager.teamId) continue;
      const weekGame = weekGames.get(manager.teamId) ?? null;
      insert.run(
        `inv-sim-${i + 1}`,
        manager.id,
        manager.teamId,
        freeAgents[i].id,
        weekGame?.id ?? null,
        week?.week ?? null,
        statuses[i % statuses.length],
        new Date().toISOString(),
      );
      invites += 1;
    }
    return invites;
  }

  /**
   * Seed a full 11-week season: 15-man rosters, free agents, profiles,
   * weekly check-ins/lineups, chat, FA invites, and scored play-by-play.
   * Idempotent: if any @sim.local guests already exist, nothing is duplicated.
   */
  generateTestData(): TestDataGenerateSummary {
    const existing = this.listSimUsers();
    if (existing.length > 0) {
      return this.emptyGenerateSummary(true);
    }

    const teams = this.getTeams();
    if (teams.length === 0) {
      throw new Error('Need at least one team to generate test data');
    }

    const rng = seededRng(SIM_RNG_SEED);
    const passwordHash = hashPassword(SIM_GUEST_PASSWORD);
    const createdAt = new Date().toISOString();

    const run = this.db.transaction(() => {
      if (this.getSchedule().length === 0) {
        this.generateSchedule({ weeks: DEFAULT_WEEKS });
      }

      const reviewer =
        this.listUsers().find((user) => user.role === 'admin') ??
        this.listUsers().find((user) => user.role === 'manager') ??
        null;

      const guests: User[] = [];
      let nextGuest = 1;
      const addGuest = (teamId: string | null, slotOnTeam: number): User => {
        const i = nextGuest;
        nextGuest += 1;
        const waiver = simWaiver(i);
        const phone = simPhone(i);
        const reviewed = waiver.waiverStatus === 'approved' || waiver.waiverStatus === 'rejected';
        const user: User = {
          id: `u-sim-guest-${i}`,
          email: `guest${i}${SIM_EMAIL_DOMAIN}`,
          name: simGuestName(i - 1),
          role: 'player',
          teamId,
          onRoster: true,
          passwordHash,
          createdAt,
          position: simPosition(slotOnTeam),
          number: simJersey(slotOnTeam),
          photoUrl: simPhotoUrl(i),
          skillLevel: simSkill(i),
          phone,
          sharePhone: simSharePhone(i, phone),
          waiverUrl: waiver.waiverUrl,
          waiverStatus: waiver.waiverStatus,
          waiverReviewedBy: reviewed ? reviewer?.id ?? null : null,
          waiverReviewedAt: reviewed ? createdAt : null,
        };
        this.insertUserRow(user);
        guests.push(user);
        return user;
      };

      const alreadyOnRoster = this.accountMemberIdsByTeam();
      for (const team of teams) {
        const already = (alreadyOnRoster.get(team.id) ?? []).length;
        const need = Math.max(0, SIM_GUESTS_PER_TEAM - already);
        for (let slot = 0; slot < need; slot += 1) {
          addGuest(team.id, already + slot);
        }
      }
      for (let slot = 0; slot < SIM_FREE_AGENT_COUNT; slot += 1) {
        addGuest(null, slot);
      }
      const rosteredCount = guests.filter((guest) => guest.teamId).length;

      const guestsByTeam = new Map<string, User[]>();
      for (const team of teams) {
        guestsByTeam.set(
          team.id,
          guests.filter((guest) => guest.teamId === team.id),
        );
      }

      let checkIns = 0;
      const weeks = [...new Set(this.getSchedule().map((game) => game.week))].sort((a, b) => a - b);
      for (const week of weeks) {
        for (const team of teams) {
          const roster = guestsByTeam.get(team.id) ?? [];
          const lineupIds = new Set(rotateLineup(roster, week, FULL_LINEUP_SIZE).map((player) => player.id));
          for (const player of roster) {
            this.setCheckIn(player.id, week, lineupIds.has(player.id) ? 'in' : 'out');
            checkIns += 1;
          }
        }
      }

      let messages = 0;
      for (const team of teams) {
        const teamGuests = guestsByTeam.get(team.id) ?? [];
        if (teamGuests.length === 0) continue;
        const count = 4 + Math.floor(rng() * 4); // 4–7
        for (let m = 0; m < count; m += 1) {
          const author = teamGuests[m % teamGuests.length];
          const text = SIM_CHAT_LINES[Math.floor(rng() * SIM_CHAT_LINES.length)];
          this.addTeamMessage({
            teamId: team.id,
            userId: author.id,
            authorName: author.name,
            text,
          });
          messages += 1;
        }
      }

      const skill = new Map(teams.map((team, index) => [team.id, teams.length - index]));
      const actorId = reviewer?.id ?? guests[0]?.id ?? 'u-sim-guest-1';
      let gamesPlayed = 0;
      for (const game of this.getSchedule()) {
        const homeSkill = skill.get(game.homeTeamId) ?? 4;
        const awaySkill = skill.get(game.awayTeamId) ?? 4;
        let homeScore = 4 + homeSkill + Math.floor(rng() * 6);
        let awayScore = 4 + awaySkill + Math.floor(rng() * 6);
        if (rng() < 0.1) {
          awayScore = homeScore;
        } else if (homeScore === awayScore) {
          homeScore += 1;
        }
        this.recordResult(game.id, homeScore, awayScore, actorId);
        this.seedSimGame(game, guestsByTeam, homeScore, awayScore, rng, actorId);
        gamesPlayed += 1;
      }

      const invites = this.seedSimInvites(guests);

      return {
        alreadySeeded: false,
        guestsCreated: guests.length,
        rosteredPlayers: rosteredCount,
        freeAgents: SIM_FREE_AGENT_COUNT,
        checkIns,
        messages,
        gamesPlayed,
        invites,
      } satisfies TestDataGenerateSummary;
    });

    return run();
  }

  /**
   * Remove every @sim.local guest (and their check-ins/messages) and reset
   * the season to unplayed. Demo/admin accounts, teams, landing, rules, theme,
   * and suggestions are left alone.
   */
  clearTestData(): TestDataClearSummary {
    const run = this.db.transaction(() => {
      const simUsers = this.listSimUsers();
      const ids = simUsers.map((u) => u.id);
      let checkInsRemoved = 0;
      let messagesRemoved = 0;

      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        checkInsRemoved = this.db
          .prepare(`DELETE FROM check_ins WHERE userId IN (${placeholders})`)
          .run(...ids).changes;
        messagesRemoved = this.db
          .prepare(`DELETE FROM messages WHERE userId IN (${placeholders})`)
          .run(...ids).changes;
        this.db.prepare(`DELETE FROM game_plate_appearances WHERE playerId IN (${placeholders})`).run(...ids);
        this.db
          .prepare(`DELETE FROM fa_invites WHERE fromUserId IN (${placeholders}) OR toUserId IN (${placeholders})`)
          .run(...ids, ...ids);
        this.db.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).run(...ids);
      }

      const gamesReset = (
        this.db.prepare('SELECT COUNT(*) AS c FROM games').get() as { c: number }
      ).c;
      this.db.prepare('UPDATE games SET homeScore = NULL, awayScore = NULL, played = 0').run();
      this.db.prepare('DELETE FROM game_plate_appearances').run();
      this.db.prepare('DELETE FROM game_logs').run();
      this.db.prepare('DELETE FROM game_lineups').run();

      return {
        guestsRemoved: simUsers.length,
        checkInsRemoved,
        messagesRemoved,
        gamesReset,
      } satisfies TestDataClearSummary;
    });

    return run();
  }
}
