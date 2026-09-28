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

export type ScoringPhase = 'upcoming' | 'live' | 'grace' | 'locked';
export type ScoreSide = 'home' | 'away';
export type ScoreStat = 'runs' | 'hits' | 'walks' | 'outs';
export type InningHalf = 'top' | 'bottom';

export interface PlayerBattingLine {
  gamesPlayed: number;
  hits: number;
  atBats: number;
  average: string;
  singles?: number;
  doubles?: number;
  triples?: number;
  homers?: number;
  strikeouts?: number;
  outs?: number;
}

export type PlayResult = 'single' | 'double' | 'triple' | 'homer' | 'out' | 'strikeout';
export type StoredPlayResult = PlayResult | 'walk';

export interface GamePlay {
  id: number;
  playerId: string;
  name: string;
  result: StoredPlayResult;
  side: ScoreSide;
  inning: number | null;
  half: InningHalf | null;
  createdAt: string;
}

export interface LineupPlayer {
  id: string;
  name: string;
  number: number | null;
  position?: string;
  stats?: PlayerBattingLine;
}

export interface GameLineup {
  teamId: string;
  slots: LineupPlayer[];
  atBat: LineupPlayer | null;
  onDeck: LineupPlayer | null;
  canEdit: boolean;
  locksAt: string | null;
  saved: boolean;
}

export interface GameBoxScore {
  homeRuns: number;
  awayRuns: number;
  homeHits: number;
  awayHits: number;
  homeWalks: number;
  awayWalks: number;
  homeOuts: number;
  awayOuts: number;
  homeBeers: number;
  awayBeers: number;
  currentOuts: number;
  awayLine?: number[];
  homeLine?: number[];
  currentInning?: number;
  currentHalf?: InningHalf;
  batterUp?: ScoreSide;
}

export interface GameScoring {
  phase: ScoringPhase;
  open: boolean;
  opensAt: string | null;
  liveEndsAt: string | null;
  closesAt: string | null;
  liveStartedAt: string | null;
  canStart: boolean;
  canScore: boolean;
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
  box?: GameBoxScore;
  scoring?: GameScoring;
  lineups?: { away: GameLineup; home: GameLineup };
  plays?: GamePlay[];
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
  /** Managers play for their team unless this is false (manager-only). */
  onRoster?: boolean;
  createdAt: string;
  position?: string;
  number?: number | null;
  photoUrl?: string;
  skillLevel?: SkillLevel | null;
  phone?: string | null;
  sharePhone?: boolean;
  waiverUrl?: string | null;
  waiverStatus?: WaiverStatus;
}

export const SKILL_LEVELS = ['rec', 'regular', 'competitive'] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];
export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  rec: 'Recreational',
  regular: 'Regular',
  competitive: 'Competitive',
};

export type WaiverStatus = 'none' | 'pending' | 'approved' | 'rejected';
export const WAIVER_STATUS_LABELS: Record<WaiverStatus, string> = {
  none: 'No waiver',
  pending: 'Waiver pending',
  approved: 'Waiver approved',
  rejected: 'Needs a new waiver',
};

export type PlayerStats = PlayerBattingLine;

export interface TeamWeekGame {
  id: string;
  date: string;
  time: string;
  field: string;
  location: string;
  opponentName: string;
  home: boolean;
}

export interface PublicPlayerProfile {
  id: string;
  name: string;
  number: number | null;
  position?: string;
  photoUrl?: string;
  skillLevel: SkillLevel | null;
  teamId: string | null;
  teamName: string | null;
  isManager: boolean;
  waiverStatus: WaiverStatus;
  waiverUrl?: string | null;
  canReviewWaiver: boolean;
  phone?: string | null;
  sharePhone: boolean;
  canSeePhone: boolean;
  stats: PlayerStats;
}

export interface FaInvite {
  id: string;
  fromUserId: string;
  fromName: string;
  teamId: string;
  teamName: string;
  toUserId: string;
  toName: string;
  gameId: string | null;
  week: number | null;
  field: string | null;
  time: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: string;
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
  skillLevel?: SkillLevel | null;
  waiverStatus?: WaiverStatus;
}

export type CheckInStatus = 'in' | 'out';

export interface CurrentWeek {
  week: number;
  date: string;
}

export type MailTransport = 'resend' | 'smtp' | 'none';

export interface MailStatus {
  configured: boolean;
  transport: MailTransport;
  from: string | null;
  notifyEmails: string[];
  publicAppUrl: string;
}

export interface ManagerAuthorization {
  email: string;
  teamId: string;
  teamName: string;
  status: 'active';
  onRoster?: boolean;
}

/** Player-account picker row (no email). */
export interface PlayerAccount {
  id: string;
  name: string;
  teamId: string | null;
}

export interface TeamManagerSummary {
  name: string;
  onRoster?: boolean;
}

/** Each team can have two managers so a backup can keep score. */
export const MANAGERS_PER_TEAM = 2;

export interface RosterResponse {
  team: Team;
  roster: Player[];
  members: TeamMember[];
  manager: TeamManagerSummary | null;
  managers?: TeamManagerSummary[];
  managerSpots?: number;
  currentWeek: CurrentWeek | null;
  freeAgencyOpen?: boolean;
}

export type LineupStatus = 'need_guys' | 'full_lineup';
/** Open roster lines shown on each team in the app and the stats sheet. */
export const TEAM_ROSTER_SPOTS = 15;

export interface FreeAgent {
  id: string;
  name: string;
  photoUrl?: string;
  number?: number | null;
  position?: string;
  skillLevel?: SkillLevel | null;
  waiverStatus?: WaiverStatus;
  invitedByMe?: boolean;
}

export interface TeamBoardRow extends Team {
  memberCount: number;
  rosterFilled: number;
  checkedInCount: number;
  lineupStatus: LineupStatus;
  manager: TeamManagerSummary | null;
  managers?: TeamManagerSummary[];
  weekGame?: TeamWeekGame | null;
}

export interface TeamBoard {
  currentWeek: CurrentWeek | null;
  fullLineupSize: number;
  rosterSpots: number;
  managerSpots?: number;
  freeAgencyOpen: boolean;
  lastRegularSeasonDate: string | null;
  freeAgents: FreeAgent[];
  teams: TeamBoardRow[];
}

export interface ProfileUpdate {
  name: string;
  position?: string;
  number?: number | null;
  photoUrl?: string | null;
  onRoster?: boolean;
  skillLevel?: SkillLevel | null;
  phone?: string | null;
  sharePhone?: boolean;
  waiverUrl?: string | null;
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

export interface TeamMessage {
  id: string;
  teamId: string;
  userId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface TestDataGenerateResult {
  alreadySeeded?: boolean;
  guestsCreated: number;
  rosteredPlayers?: number;
  freeAgents?: number;
  checkIns: number;
  messages: number;
  gamesPlayed: number;
  invites?: number;
}

export interface TestDataClearResult {
  guestsRemoved: number;
  checkInsRemoved: number;
  messagesRemoved: number;
  gamesReset: number;
}

export interface PlayerStatsSheetStatus {
  spreadsheetId: string;
  spreadsheetUrl: string;
  tab: string;
  configured: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: 'ok' | 'dry-run' | 'error' | null;
  lastSyncError: string | null;
  lastSyncPlayerCount: number | null;
  teamCount: number;
  playerCount: number;
  freeAgentCount: number;
}

export interface PlayerStatsSheetRow {
  player: string;
  number: string;
  position: string;
  gp: number;
  hits: number;
  ab: number;
  avg: string;
  singles: number;
  doubles: number;
  triples: number;
  homers: number;
  strikeouts: number;
  outs: number;
}

export interface PlayerStatsSheetSection {
  teamId: string | null;
  teamName: string;
  players: PlayerStatsSheetRow[];
}

export interface PlayerStatsSheetSyncResult extends PlayerStatsSheetStatus {
  ok: true;
  dryRun: boolean;
  wrote: boolean;
  createdTab?: boolean;
  updatedCells?: number;
  updatedAt: string;
  sections: PlayerStatsSheetSection[];
  values: Array<Array<string | number>>;
}

import type { Theme, ThemeUpdate } from './theme';
export type { Theme, ThemeId, ThemePreset, ThemeUpdate } from './theme';

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
  getGame: (gameId: string) => request<Game>(`/api/games/${gameId}`),
  startLiveGame: (gameId: string) =>
    request<Game>(`/api/games/${gameId}/scorelog/start`, { method: 'POST' }),
  bumpScoreStat: (gameId: string, side: ScoreSide, stat: ScoreStat, delta: number) =>
    request<Game>(`/api/games/${gameId}/scorelog/stat`, {
      method: 'POST',
      body: JSON.stringify({ side, stat, delta }),
    }),
  bumpCurrentOuts: (gameId: string, delta: number) =>
    request<Game>(`/api/games/${gameId}/scorelog/outs`, {
      method: 'POST',
      body: JSON.stringify({ delta }),
    }),
  bumpInningRun: (gameId: string, side: ScoreSide, inning: number, delta: number) =>
    request<Game>(`/api/games/${gameId}/scorelog/inning`, {
      method: 'POST',
      body: JSON.stringify({ side, inning, delta }),
    }),
  recordPlay: (gameId: string, result: PlayResult) =>
    request<Game>(`/api/games/${gameId}/scorelog/play`, {
      method: 'POST',
      body: JSON.stringify({ result }),
    }),
  undoLastPlay: (gameId: string) =>
    request<Game>(`/api/games/${gameId}/scorelog/play/undo`, { method: 'POST' }),
  saveLineup: (gameId: string, teamId: string, playerIds: string[]) =>
    request<Game>(`/api/games/${gameId}/lineups/${teamId}`, {
      method: 'PUT',
      body: JSON.stringify({ playerIds }),
    }),
  getTeams: () => request<Team[]>('/api/teams'),
  getTeamBoard: () => request<TeamBoard>('/api/team-board'),
  getPlayer: (id: string) => request<PublicPlayerProfile>(`/api/players/${id}`),
  getRoster: (teamId: string) => request<RosterResponse>(`/api/teams/${teamId}/roster`),
  listPendingWaivers: () => request<PublicPlayerProfile[]>('/api/waivers/pending'),
  reviewWaiver: (playerId: string, status: 'approved' | 'rejected') =>
    request<PublicPlayerProfile>(`/api/players/${playerId}/waiver`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  listFaInvites: () => request<FaInvite[]>('/api/fa-invites'),
  inviteFreeAgent: (userId: string) =>
    request<FaInvite>('/api/fa-invites', { method: 'POST', body: JSON.stringify({ userId }) }),
  respondFaInvite: (id: string, accept: boolean) =>
    request<FaInvite>(`/api/fa-invites/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ accept }),
    }),
  cancelFaInvite: (id: string) => request<FaInvite>(`/api/fa-invites/${id}`, { method: 'DELETE' }),
  getRules: () => request<{ rules: string }>('/api/rules'),
  getLanding: () => request<Landing>('/api/landing'),
  updateLanding: (payload: LandingUpdate) =>
    request<Landing>('/api/landing', { method: 'PUT', body: JSON.stringify(payload) }),
  getTheme: () => request<Theme>('/api/theme', { cache: 'no-store' }),
  updateTheme: (payload: ThemeUpdate) =>
    request<Theme>('/api/theme', { method: 'PUT', body: JSON.stringify(payload) }),
  getMaintenance: () => request<{ maintenance: boolean }>('/api/maintenance', { cache: 'no-store' }),
  setMaintenance: (on: boolean) =>
    request<{ maintenance: boolean }>('/api/maintenance', {
      method: 'PUT',
      body: JSON.stringify({ on }),
    }),
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
  setUserRole: (userId: string, role: Role, teamId: string | null, onRoster?: boolean) =>
    request<User>(`/api/users/${userId}/role`, {
      method: 'POST',
      body: JSON.stringify({ role, teamId, ...(onRoster === undefined ? {} : { onRoster }) }),
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
  authorizeManagers: (emails: string | string[], teamId: string, onRoster = true) =>
    request<{ promoted: string[]; skipped: string[] }>('/api/manager-emails', {
      method: 'POST',
      body: JSON.stringify({ emails, teamId, onRoster }),
    }),
  revokeManagerEmail: (email: string) =>
    request<{ ok: boolean }>(`/api/manager-emails/${encodeURIComponent(email)}`, { method: 'DELETE' }),

  // Team group chat
  getTeamMessages: (teamId: string) => request<TeamMessage[]>(`/api/teams/${teamId}/messages`),
  sendTeamMessage: (teamId: string, text: string) =>
    request<TeamMessage>(`/api/teams/${teamId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  // TEST DATA (simulation, admin only)
  generateTestData: () =>
    request<TestDataGenerateResult>('/api/admin/test-data/generate', { method: 'POST' }),
  clearTestData: () =>
    request<TestDataClearResult>('/api/admin/test-data/clear', { method: 'POST' }),

  getPlayerStatsSheetStatus: () => request<PlayerStatsSheetStatus>('/api/admin/player-stats-sheet'),
  syncPlayerStatsSheet: (dryRun = false) =>
    request<PlayerStatsSheetSyncResult>('/api/admin/player-stats-sheet/sync', {
      method: 'POST',
      body: JSON.stringify({ dryRun }),
    }),
  downloadPlayerStatsCsv: async () => {
    const res = await fetch('/api/admin/player-stats-sheet.csv', { credentials: 'same-origin' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'oakdale-player-stats.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  getMailStatus: () => request<MailStatus>('/api/mail'),
  sendTestMail: () => request<{ ok: true; to: string }>('/api/mail/test', { method: 'POST' }),
};
