export interface Team {
  id: string;
  name: string;
  /** Data-URL thumbnail (data:image/...), set by admin or the team's manager. */
  photoUrl?: string;
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

export type Role = 'admin' | 'manager' | 'player';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** For managers: the team they manage. For players: the team they belong to. Null for admins. */
  teamId: string | null;
  passwordHash: string;
  createdAt: string;
  /** Self-editable profile fields. */
  position?: string;
  number?: number | null;
  photoUrl?: string;
}

/** User shape safe to return over the API (no password hash). */
export type PublicUser = Omit<User, 'passwordHash'>;

/** Public-safe player-account row on a team roster (no email). */
export interface TeamMember {
  id: string;
  name: string;
  number: number | null;
  position?: string;
  photoUrl?: string;
}

/** Player-account picker row (no email). */
export interface PlayerAccount {
  id: string;
  name: string;
  teamId: string | null;
}

export interface LeagueData {
  teams: Team[];
  players: Player[];
  games: Game[];
  users: User[];
  rules: string;
}
