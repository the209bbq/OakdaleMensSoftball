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
  /** True when this member is the team's manager (managers also play). */
  isManager: boolean;
  /** Current-week RSVP; null means no response. */
  checkIn: CheckInStatus | null;
}

/** Pre-authorization allowlist entry: email is granted manager of teamId on signup. */
export interface PendingManager {
  email: string;
  teamId: string;
}

/** Combined active-manager + pending-authorization row for the admin UI. */
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

/** Public suggestion submitted from the Home page. */
export interface Suggestion {
  id: string;
  text: string;
  authorName: string | null;
  createdAt: string;
}

/** Team-scoped group-chat message. */
export interface TeamMessage {
  id: string;
  teamId: string;
  userId: string;
  authorName: string;
  text: string;
  createdAt: string;
}
