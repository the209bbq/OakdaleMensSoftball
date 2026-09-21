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
  homeTeamName: string;
  awayTeamName: string;
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

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  getStandings: () => getJson<StandingRow[]>('/api/standings'),
  getSchedule: () => getJson<Game[]>('/api/schedule'),
  getTeams: () => getJson<Team[]>('/api/teams'),
  getRoster: (teamId: string) => getJson<{ team: Team; roster: Player[] }>(`/api/teams/${teamId}/roster`),
  addPlayer: async (input: { teamId: string; name: string; number: number; position: string }) => {
    const res = await fetch('/api/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Request failed: ${res.status}`);
    }
    return res.json() as Promise<Player>;
  },
};
