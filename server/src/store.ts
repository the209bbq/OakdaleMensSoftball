import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import Database from 'better-sqlite3';
import type {
  Game,
  LeagueData,
  ManagerAuthorization,
  Player,
  PlayerAccount,
  PublicUser,
  Role,
  StandingRow,
  Team,
  TeamMember,
  User,
} from './types.js';
import { createSeedData } from './seed.js';
import { DEFAULT_LOCATION, generateRoundRobin, type GenerateOptions } from './schedule.js';
import { hashPassword, verifyPassword } from './auth.js';

export const MAX_PHOTO_URL_CHARS = 800000;

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
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pending_managers (
  email TEXT PRIMARY KEY,
  teamId TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
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
  createdAt: string;
};
type PendingRow = { email: string; teamId: string };

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
  return pub;
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

function userFromRow(row: UserRow): User {
  const user: User = {
    id: row.id,
    email: row.email,
    name: row.name,
    role: backfillRole(row.role),
    teamId: row.teamId,
    passwordHash: row.passwordHash,
    createdAt: row.createdAt,
  };
  if (row.position) user.position = row.position;
  if (row.number != null) user.number = row.number;
  if (row.photoUrl) user.photoUrl = row.photoUrl;
  return user;
}

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
      `INSERT INTO users (id, email, name, role, teamId, passwordHash, position, number, photoUrl, createdAt)
       VALUES (@id, @email, @name, @role, @teamId, @passwordHash, @position, @number, @photoUrl, @createdAt)`,
    );
    const insertPending = this.db.prepare(
      'INSERT INTO pending_managers (email, teamId) VALUES (@email, @teamId)',
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
          createdAt: user.createdAt,
        });
      }
      for (const pending of data.pendingManagers) {
        insertPending.run({ email: pending.email, teamId: pending.teamId });
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
        `INSERT INTO users (id, email, name, role, teamId, passwordHash, position, number, photoUrl, createdAt)
         VALUES (@id, @email, @name, @role, @teamId, @passwordHash, @position, @number, @photoUrl, @createdAt)`,
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
        createdAt: user.createdAt,
      });
  }

  private updateUserRow(user: User): void {
    this.db
      .prepare(
        `UPDATE users SET email = @email, name = @name, role = @role, teamId = @teamId,
         passwordHash = @passwordHash, position = @position, number = @number, photoUrl = @photoUrl, createdAt = @createdAt
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
        createdAt: user.createdAt,
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
      this.db.prepare('DELETE FROM games').run();
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

  recordResult(gameId: string, homeScore: number, awayScore: number): Game {
    const game = this.getGame(gameId);
    if (!game) {
      throw new Error(`Unknown game: ${gameId}`);
    }
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore < 0 || awayScore < 0) {
      throw new Error('Scores must be non-negative numbers');
    }
    this.db
      .prepare('UPDATE games SET homeScore = ?, awayScore = ?, played = 1 WHERE id = ?')
      .run(homeScore, awayScore, gameId);
    game.homeScore = homeScore;
    game.awayScore = awayScore;
    game.played = true;
    return game;
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
      passwordHash: hashPassword(input.password),
      createdAt: new Date().toISOString(),
    };

    const pending = this.db
      .prepare('SELECT email, teamId FROM pending_managers WHERE email = ?')
      .get(email) as PendingRow | undefined;
    if (pending) {
      this.db.prepare('DELETE FROM pending_managers WHERE email = ?').run(email);
      if (this.getTeam(pending.teamId)) {
        user.role = 'manager';
        user.teamId = pending.teamId;
      }
    }

    this.insertUserRow(user);
    return toPublicUser(user);
  }

  authenticate(email: string, password: string): PublicUser | null {
    const user = this.getUserByEmail(email ?? '');
    if (!user) return null;
    if (!verifyPassword(password ?? '', user.passwordHash)) return null;
    return toPublicUser(user);
  }

  /** Assign a role. Managers are pinned to a team; other roles clear teamId. */
  setUserRole(userId: string, role: Role, teamId: string | null = null): PublicUser {
    const user = this.getUserById(userId);
    if (!user) throw new Error('Unknown user');
    if (role === 'manager') {
      if (!teamId || !this.getTeam(teamId)) throw new Error('A valid team is required for managers');
      user.teamId = teamId;
    } else {
      user.teamId = null;
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
   * Player-role accounts AND the team's manager on this team, public-safe (no email).
   * Managers sort first (they also play); then by number, then name.
   */
  getTeamMembers(teamId: string): TeamMember[] {
    const rows = this.db.prepare('SELECT * FROM users').all() as UserRow[];
    return rows
      .map(userFromRow)
      .filter((u) => (u.role === 'player' || u.role === 'manager') && u.teamId === teamId)
      .map(
        (u): TeamMember => ({
          id: u.id,
          name: u.name,
          number: u.number ?? null,
          position: u.position,
          photoUrl: u.photoUrl,
          isManager: u.role === 'manager',
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

  /** Manager-role user assigned to this team, or null. Name only — never email. */
  getTeamManager(teamId: string): { name: string } | null {
    const rows = this.db.prepare('SELECT * FROM users ORDER BY rowid').all() as UserRow[];
    const manager = rows.map(userFromRow).find((u) => u.role === 'manager' && u.teamId === teamId);
    return manager ? { name: manager.name } : null;
  }

  /**
   * Authorize emails as managers of `teamId`. Existing accounts are promoted
   * immediately; others are stored as pending and auto-granted on signup.
   */
  authorizeManagers(emails: string[], teamId: string): { promoted: string[]; pending: string[] } {
    if (!this.getTeam(teamId)) throw new Error(`Unknown team: ${teamId}`);
    const promoted: string[] = [];
    const pending: string[] = [];
    const seen = new Set<string>();

    const tx = this.db.transaction(() => {
      for (const raw of emails) {
        const email = (raw ?? '').trim().toLowerCase();
        if (!email) continue;
        if (seen.has(email)) continue;
        seen.add(email);

        const existing = this.getUserByEmail(email);
        if (existing) {
          this.setUserRole(existing.id, 'manager', teamId);
          this.db.prepare('DELETE FROM pending_managers WHERE email = ?').run(email);
          promoted.push(email);
        } else {
          const already = this.db
            .prepare('SELECT email FROM pending_managers WHERE email = ?')
            .get(email) as { email: string } | undefined;
          if (already) {
            this.db.prepare('UPDATE pending_managers SET teamId = ? WHERE email = ?').run(teamId, email);
          } else {
            this.db.prepare('INSERT INTO pending_managers (email, teamId) VALUES (?, ?)').run(email, teamId);
          }
          pending.push(email);
        }
      }
    });
    tx();
    return { promoted, pending };
  }

  /** Combined list of active managers and pending (not-yet-registered) authorizations. */
  listManagerAuthorizations(): ManagerAuthorization[] {
    const rows: ManagerAuthorization[] = [];
    const activeEmails = new Set<string>();

    const users = (this.db.prepare('SELECT * FROM users').all() as UserRow[]).map(userFromRow);
    for (const user of users) {
      if (user.role !== 'manager' || !user.teamId) continue;
      const team = this.getTeam(user.teamId);
      rows.push({
        email: user.email,
        teamId: user.teamId,
        teamName: team?.name ?? user.teamId,
        status: 'active',
      });
      activeEmails.add(user.email);
    }

    const pending = this.db.prepare('SELECT email, teamId FROM pending_managers').all() as PendingRow[];
    for (const entry of pending) {
      if (activeEmails.has(entry.email)) continue;
      if (this.getUserByEmail(entry.email)) continue;
      const team = this.getTeam(entry.teamId);
      rows.push({
        email: entry.email,
        teamId: entry.teamId,
        teamName: team?.name ?? entry.teamId,
        status: 'pending',
      });
    }

    return rows.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      return a.email.localeCompare(b.email);
    });
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
    input: { name: string; position?: string; number?: number | null; photoUrl?: string | null },
  ): PublicUser {
    const user = this.getUserById(userId);
    if (!user) throw new Error('Unknown user');
    const name = (input.name ?? '').trim();
    if (!name) throw new Error('Name is required');
    user.name = name;
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
    this.updateUserRow(user);
    return toPublicUser(user);
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
}
