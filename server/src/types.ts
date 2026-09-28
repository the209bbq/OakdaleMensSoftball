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

import type { PlayerBattingLine } from './gameScoring.js';

export type {
  GameBoxScore,
  GamePlay,
  PlayerBattingLine,
  PlayResult,
  ScoreSide,
  ScoreStat,
  ScoringPhase,
  ScoringWindow,
} from './gameScoring.js';

/** One batter in a game lineup (account member or unregistered roster row). */
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

/** Account-member check-in counts for one team in one scheduled week. */
export interface TeamAttendance {
  in: number;
  out: number;
  none: number;
  total: number;
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
  beers: number;
}

export type Role = 'admin' | 'manager' | 'player';

export const SKILL_LEVELS = ['rec', 'regular', 'competitive'] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export type WaiverStatus = 'none' | 'pending' | 'approved' | 'rejected';

export type PlayerStats = import('./gameScoring.js').PlayerBattingLine;

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

export type FaInviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

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
  status: FaInviteStatus;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** For managers: the team they manage (and play for, unless onRoster is false). For players: the team they belong to. Null for admins. */
  teamId: string | null;
  /**
   * Managers default to playing for the team they manage.
   * `false` is manager-only: they still manage, but they are not on the roster.
   * Players and admins ignore this (players are always on their team).
   */
  onRoster: boolean;
  passwordHash: string;
  createdAt: string;
  /** Self-editable profile fields. */
  position?: string;
  number?: number | null;
  photoUrl?: string;
  skillLevel?: SkillLevel | null;
  phone?: string | null;
  /** When true, managers (and admin) can see this player's phone. */
  sharePhone: boolean;
  waiverUrl?: string | null;
  waiverStatus: WaiverStatus;
  waiverReviewedBy?: string | null;
  waiverReviewedAt?: string | null;
}

/** User shape safe to return over the API (no password hash). */
export type PublicUser = Omit<User, 'passwordHash'>;

export type CheckInStatus = 'in' | 'out';

/** One player's RSVP for a scheduled week. Absence of a row = no response. */
export interface CheckIn {
  userId: string;
  week: number;
  status: CheckInStatus;
}

/** Upcoming/in-progress game week (or the last week once the season is over). */
export interface CurrentWeek {
  week: number;
  date: string;
}

/** Public-safe player-account row on a team roster (no email). */
export interface TeamMember {
  id: string;
  name: string;
  number: number | null;
  position?: string;
  photoUrl?: string;
  /** True when this member is the team's manager and also plays. */
  isManager: boolean;
  /** Current-week RSVP; null means no response. */
  checkIn: CheckInStatus | null;
  skillLevel?: SkillLevel | null;
  waiverStatus?: WaiverStatus;
}

/** Legacy import-only row. New signups are always players. */
export interface PendingManager {
  email: string;
  teamId: string;
  onRoster: boolean;
}

/** Public-safe manager slot on a team (name only). */
export interface TeamManagerSummary {
  name: string;
  onRoster: boolean;
}

/** Active manager row for the admin list. */
export interface ManagerAuthorization {
  email: string;
  teamId: string;
  teamName: string;
  status: 'active';
  /** Playing managers are on this team's roster; manager-only is not. */
  onRoster: boolean;
}

/** Player-account picker row (no email). */
export interface PlayerAccount {
  id: string;
  name: string;
  teamId: string | null;
}

export type LineupStatus = 'need_guys' | 'full_lineup';

/** Public-safe free agent (player-role, no team). */
export interface FreeAgent {
  id: string;
  name: string;
  photoUrl?: string;
  number?: number | null;
  position?: string;
  skillLevel?: SkillLevel | null;
  waiverStatus: WaiverStatus;
  invitedByMe?: boolean;
}

/** One team row on the Teams board. */
export interface TeamBoardRow extends Team {
  memberCount: number;
  rosterFilled: number;
  checkedInCount: number;
  lineupStatus: LineupStatus;
  manager: TeamManagerSummary | null;
  managers: TeamManagerSummary[];
  weekGame: TeamWeekGame | null;
}

/** Live Teams tab payload: lineup holes + free agents until playoffs. */
export interface TeamBoard {
  currentWeek: CurrentWeek | null;
  fullLineupSize: number;
  rosterSpots: number;
  managerSpots: number;
  freeAgencyOpen: boolean;
  lastRegularSeasonDate: string | null;
  freeAgents: FreeAgent[];
  teams: TeamBoardRow[];
}

export interface LeagueData {
  teams: Team[];
  players: Player[];
  games: Game[];
  users: User[];
  rules: string;
  pendingManagers: PendingManager[];
}

/** Editable landing-page fields stored as JSON in `settings.landing`. */
export interface LandingContent {
  headline: string;
  body: string;
  imageUrl: string | null;
  countdownLabel: string;
  countdownTarget: string | null;
}

/** Landing payload returned by GET/PUT /api/landing. */
export interface Landing extends LandingContent {
  /** Explicit target, or the earliest scheduled game datetime when unset. */
  effectiveCountdownTarget: string | null;
}

export type { Theme, ThemeId, ThemeInput } from './theme.js';

/** Team-scoped group-chat message. */
export interface TeamMessage {
  id: string;
  teamId: string;
  userId: string;
  authorName: string;
  text: string;
  createdAt: string;
}
