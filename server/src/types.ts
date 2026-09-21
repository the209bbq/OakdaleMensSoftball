export interface Team {
  id: string;
  name: string;
}

export interface Player {
  id: string;
  teamId: string;
  name: string;
  number: number;
  position: string;
}

export interface Game {
  id: string;
  date: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  played: boolean;
  /** e.g. "Field 1" */
  field: string;
  /** e.g. "6:00 PM" */
  time: string;
  /** e.g. "Kerr Park" */
  location: string;
  /** 1-based regular-season week */
  week: number;
}

export interface StandingRow {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  runsFor: number;
  runsAgainst: number;
  gamesPlayed: number;
}

export type Role = 'admin' | 'captain' | 'member';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** For captains: the team they manage. Null for admins/members. */
  teamId: string | null;
  passwordHash: string;
  createdAt: string;
}

/** User shape safe to return over the API (no password hash). */
export type PublicUser = Omit<User, 'passwordHash'>;

export interface LeagueData {
  teams: Team[];
  players: Player[];
  games: Game[];
  users: User[];
  rules: string;
}
