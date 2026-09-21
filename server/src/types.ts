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

export interface LeagueData {
  teams: Team[];
  players: Player[];
  games: Game[];
}
