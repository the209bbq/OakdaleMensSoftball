export interface Team {
  id: string;
  name: string;
  photoUrl?: string;
}

export interface Player {
  id: string;
  teamId: string;
  name: string;
  number: number;
  position: string;
}

/** Account-member check-in counts for one team in one scheduled week. */
export interface TeamAttendance {
  in: number;
  out: number;
  none: number;
  total: number;
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
  homeAttendance?: TeamAttendance;
  awayAttendance?: TeamAttendance;
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
  position?: string;
  number?: number | null;
  photoUrl?: string;
}

/** Public-safe player account on a team roster (no email). */
export interface TeamMember {
  id: string;
  name: string;
  number: number | null;
  position?: string;
  photoUrl?: string;
  isManager?: boolean;
  checkIn?: 'in' | 'out' | null;
}

export type CheckInStatus = 'in' | 'out';

export interface CurrentWeek {
  week: number;
  date: string;
}

export interface ManagerAuthorization {
  email: string;
  teamId: string;
  teamName: string;
  status: 'active' | 'pending';
}

/** Player-account picker row (no email). */
export interface PlayerAccount {
  id: string;
  name: string;
  teamId: string | null;
}

export interface TeamManagerSummary {
  name: string;
}

export interface RosterResponse {
  team: Team;
  roster: Player[];
  members: TeamMember[];
  manager: TeamManagerSummary | null;
  currentWeek: CurrentWeek | null;
}

export interface ProfileUpdate {
  name: string;
  position?: string;
  number?: number | null;
  photoUrl?: string | null;
}

export interface Landing {
  headline: string;
  body: string;
  imageUrl: string | null;
  countdownLabel: string;
  countdownTarget: string | null;
  effectiveCountdownTarget: string | null;
}

export type LandingUpdate = Partial<
  Pick<Landing, 'headline' | 'body' | 'imageUrl' | 'countdownLabel' | 'countdownTarget'>
>;

export interface Suggestion {
  id: string;
  text: string;
  authorName: string | null;
  createdAt: string;
}

export interface TeamMessage {
  id: string;
  teamId: string;
  userId: string;
  authorName: string;
  text: string;
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
  getRoster: (teamId: string) => request<RosterResponse>(`/api/teams/${teamId}/roster`),
  getRules: () => request<{ rules: string }>('/api/rules'),
  getLanding: () => request<Landing>('/api/landing'),
  updateLanding: (payload: LandingUpdate) =>
    request<Landing>('/api/landing', { method: 'PUT', body: JSON.stringify(payload) }),
  getCurrentWeek: () => request<CurrentWeek | null>('/api/current-week'),
  checkIn: (week: number, status: CheckInStatus | null) =>
    request<{ ok: true; week: number; status: CheckInStatus | null }>('/api/checkin', {
      method: 'POST',
      body: JSON.stringify({ week, status }),
    }),

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
  setTeamPhoto: (id: string, photoUrl: string | null) =>
    request<Team>(`/api/teams/${id}/photo`, { method: 'PUT', body: JSON.stringify({ photoUrl }) }),
  updateProfile: (payload: ProfileUpdate) =>
    request<User>('/api/auth/profile', { method: 'PUT', body: JSON.stringify(payload) }),
  joinTeam: (teamId: string | null) =>
    request<User>('/api/auth/team', { method: 'PUT', body: JSON.stringify({ teamId }) }),
  setUserTeam: (userId: string, teamId: string | null) =>
    request<User>(`/api/users/${userId}/team`, { method: 'POST', body: JSON.stringify({ teamId }) }),
  listMembers: () => request<PlayerAccount[]>('/api/members'),
  updateRules: (rules: string) =>
    request<{ rules: string }>('/api/rules', { method: 'PUT', body: JSON.stringify({ rules }) }),
  listManagerEmails: () => request<ManagerAuthorization[]>('/api/manager-emails'),
  authorizeManagers: (emails: string | string[], teamId: string) =>
    request<{ promoted: string[]; pending: string[] }>('/api/manager-emails', {
      method: 'POST',
      body: JSON.stringify({ emails, teamId }),
    }),
  revokeManagerEmail: (email: string) =>
    request<{ ok: boolean }>(`/api/manager-emails/${encodeURIComponent(email)}`, { method: 'DELETE' }),

  // Suggestions (public submit; admin list/delete). Routing to an external
  // place can be added later; for now admins view them in-app.
  submitSuggestion: (input: { text: string; name?: string }) =>
    request<Suggestion>('/api/suggestions', { method: 'POST', body: JSON.stringify(input) }),
  listSuggestions: () => request<Suggestion[]>('/api/suggestions'),
  deleteSuggestion: (id: string) =>
    request<{ ok: boolean }>(`/api/suggestions/${id}`, { method: 'DELETE' }),

  // Team group chat
  getTeamMessages: (teamId: string) => request<TeamMessage[]>(`/api/teams/${teamId}/messages`),
  sendTeamMessage: (teamId: string, text: string) =>
    request<TeamMessage>(`/api/teams/${teamId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
};
