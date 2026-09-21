import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Game, LeagueData, Player, StandingRow, Team } from './types.js';
import { createSeedData } from './seed.js';

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
}
