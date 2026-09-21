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
  field: string;
  time: string;
  location: string;
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
  teamId: string | null;
  createdAt: string;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Public reads
  getStandings: () => request<StandingRow[]>('/api/standings'),
  getSchedule: () => request<Game[]>('/api/schedule'),
  getTeams: () => request<Team[]>('/api/teams'),
  getRoster: (teamId: string) => request<{ team: Team; roster: Player[] }>(`/api/teams/${teamId}/roster`),
  getRules: () => request<{ rules: string }>('/api/rules'),

  // Auth
  me: () => request<{ user: User | null }>('/api/auth/me'),
  login: (email: string, password: string) =>
    request<User>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, name: string, password: string) =>
    request<User>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, name, password }) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  // Writes (role-gated server-side)
  addPlayer: (input: { teamId: string; name: string; number: number; position: string }) =>
    request<Player>('/api/players', { method: 'POST', body: JSON.stringify(input) }),
  removePlayer: (playerId: string) =>
    request<{ ok: boolean }>(`/api/players/${playerId}`, { method: 'DELETE' }),
  recordResult: (gameId: string, homeScore: number, awayScore: number) =>
    request<Game>(`/api/games/${gameId}/result`, {
      method: 'POST',
      body: JSON.stringify({ homeScore, awayScore }),
    }),
  generateSchedule: (startDate?: string, weeks?: number) =>
    request<Game[]>('/api/schedule/generate', {
      method: 'POST',
      body: JSON.stringify({
        ...(startDate ? { startDate } : {}),
        ...(weeks !== undefined ? { weeks } : {}),
      }),
    }),

  // Admin
  listUsers: () => request<User[]>('/api/users'),
  setUserRole: (userId: string, role: Role, teamId: string | null) =>
    request<User>(`/api/users/${userId}/role`, {
      method: 'POST',
      body: JSON.stringify({ role, teamId }),
    }),
  createTeam: (name: string) =>
    request<Team>('/api/teams', { method: 'POST', body: JSON.stringify({ name }) }),
  renameTeam: (id: string, name: string) =>
    request<Team>('/api/teams/' + id, { method: 'PUT', body: JSON.stringify({ name }) }),
  updateRules: (rules: string) =>
    request<{ rules: string }>('/api/rules', { method: 'PUT', body: JSON.stringify({ rules }) }),
};
