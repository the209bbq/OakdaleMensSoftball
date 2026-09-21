import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Game, LeagueData, Player, PublicUser, Role, StandingRow, Team, User } from './types.js';
import { createSeedData } from './seed.js';
import { generateRoundRobin, type GenerateOptions } from './schedule.js';
import { hashPassword, verifyPassword } from './auth.js';

function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...pub } = user;
  return pub;
}

/**
 * Simple JSON-file-backed data store. Zero native dependencies so it builds and
 * runs reliably in any environment. When no persistence path is provided the
 * store stays in memory (used by tests).
 */
export class LeagueStore {
  private data: LeagueData;
  private readonly persistPath: string | null;

  constructor(persistPath: string | null = null) {
    this.persistPath = persistPath;
    if (persistPath && existsSync(persistPath)) {
      this.data = JSON.parse(readFileSync(persistPath, 'utf-8')) as LeagueData;
      // Backfill fields added after a data file was first written.
      if (!Array.isArray(this.data.users)) this.data.users = [];
    } else {
      this.data = createSeedData();
      this.persist();
    }
  }

  private persist(): void {
    if (!this.persistPath) return;
    mkdirSync(dirname(this.persistPath), { recursive: true });
    writeFileSync(this.persistPath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  getTeams(): Team[] {
    return [...this.data.teams].sort((a, b) => a.name.localeCompare(b.name));
  }

  getTeam(teamId: string): Team | undefined {
    return this.data.teams.find((t) => t.id === teamId);
  }

  getRoster(teamId: string): Player[] {
    return this.data.players
      .filter((p) => p.teamId === teamId)
      .sort((a, b) => a.number - b.number);
  }

  getSchedule(): Game[] {
    return [...this.data.games].sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Replace the season schedule with a freshly generated single round-robin
   * built from the current teams. The first round is the season opener.
   */
  generateSchedule(options: GenerateOptions = {}): Game[] {
    if (this.data.teams.length < 2) {
      throw new Error('Need at least two teams to generate a schedule');
    }
    this.data.games = generateRoundRobin(this.data.teams, options);
    this.persist();
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
    this.data.players.push(player);
    this.persist();
    return player;
  }

  recordResult(gameId: string, homeScore: number, awayScore: number): Game {
    const game = this.data.games.find((g) => g.id === gameId);
    if (!game) {
      throw new Error(`Unknown game: ${gameId}`);
    }
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore < 0 || awayScore < 0) {
      throw new Error('Scores must be non-negative numbers');
    }
    game.homeScore = homeScore;
    game.awayScore = awayScore;
    game.played = true;
    this.persist();
    return game;
  }

  getStandings(): StandingRow[] {
    const rows = new Map<string, StandingRow>();
    for (const team of this.data.teams) {
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

    for (const game of this.data.games) {
      if (!game.played || game.homeScore === null || game.awayScore === null) continue;
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
      const bDiff = b.runsFor - b.runsAgainst;
      if (bDiff !== aDiff) return bDiff - aDiff;
      return a.teamName.localeCompare(b.teamName);
    });
  }

  createTeam(name: string): Team {
    const trimmed = (name ?? '').trim();
    if (!trimmed) throw new Error('Team name is required');
    const id = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `team${Date.now()}`;
    if (this.data.teams.some((t) => t.id === id)) {
      throw new Error('A team with a similar name already exists');
    }
    const team: Team = { id, name: trimmed };
    this.data.teams.push(team);
    this.persist();
    return team;
  }

  removePlayer(playerId: string): void {
    const before = this.data.players.length;
    this.data.players = this.data.players.filter((p) => p.id !== playerId);
    if (this.data.players.length === before) {
      throw new Error(`Unknown player: ${playerId}`);
    }
    this.persist();
  }

  getPlayer(playerId: string): Player | undefined {
    return this.data.players.find((p) => p.id === playerId);
  }

  getGame(gameId: string): Game | undefined {
    return this.data.games.find((g) => g.id === gameId);
  }

  // ---- Users & auth ------------------------------------------------------

  listUsers(): PublicUser[] {
    return [...this.data.users]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toPublicUser);
  }

  getUserById(id: string): User | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  getUserByEmail(email: string): User | undefined {
    const normalized = email.trim().toLowerCase();
    return this.data.users.find((u) => u.email === normalized);
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
      role: input.role ?? 'member',
      teamId: input.role === 'captain' ? input.teamId ?? null : null,
      passwordHash: hashPassword(input.password),
      createdAt: new Date().toISOString(),
    };
    this.data.users.push(user);
    this.persist();
    return toPublicUser(user);
  }

  authenticate(email: string, password: string): PublicUser | null {
    const user = this.getUserByEmail(email ?? '');
    if (!user) return null;
    if (!verifyPassword(password ?? '', user.passwordHash)) return null;
    return toPublicUser(user);
  }

  /** Assign a role. Captains are pinned to a team; other roles clear teamId. */
  setUserRole(userId: string, role: Role, teamId: string | null = null): PublicUser {
    const user = this.getUserById(userId);
    if (!user) throw new Error('Unknown user');
    if (role === 'captain') {
      if (!teamId || !this.getTeam(teamId)) throw new Error('A valid team is required for captains');
      user.teamId = teamId;
    } else {
      user.teamId = null;
    }
    user.role = role;
    this.persist();
    return toPublicUser(user);
  }

  toPublicUser(user: User): PublicUser {
    return toPublicUser(user);
  }

  /** Ensure an admin account exists (bootstrapped from env at startup). */
  ensureAdmin(email: string, name: string, password: string): PublicUser {
    const existing = this.getUserByEmail(email);
    if (existing) {
      if (existing.role !== 'admin') {
        existing.role = 'admin';
        existing.teamId = null;
        this.persist();
      }
      return toPublicUser(existing);
    }
    return this.registerUser({ email, name, password, role: 'admin' });
  }
}
