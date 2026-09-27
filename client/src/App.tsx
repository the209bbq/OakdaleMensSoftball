import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api, MANAGERS_PER_TEAM, SKILL_LEVEL_LABELS, SKILL_LEVELS, TEAM_ROSTER_SPOTS, WAIVER_STATUS_LABELS, type CurrentWeek, type FaInvite, type Game, type GameBoxScore, type GameLineup, type GamePlay, type InningHalf, type Landing, type LineupPlayer, type MailStatus, type ManagerAuthorization, type Player, type PlayerAccount, type PlayerBattingLine, type PlayResult, type PlayerStatsSheetStatus, type PublicPlayerProfile, type Role, type ScoreSide, type ScoringPhase, type SkillLevel, type StandingRow, type Suggestion, type Team, type TeamAttendance, type TeamBoard, type TeamBoardRow, type TeamMember, type TeamMessage, type TeamManagerSummary, type TestDataClearResult, type TestDataGenerateResult, type Theme, type ThemeId, type User, type WaiverStatus } from './api';
import { useAuth } from './auth';
import { fileToBannerDataUrl, fileToSquareDataUrl, fileToWaiverDataUrl } from './image';
import { applyTheme } from './theme';

type Tab = 'home' | 'standings' | 'schedule' | 'teams' | 'rules' | 'admin';

const TAB_TITLES: Record<Tab, string> = {
  home: 'Home',
  standings: 'Standings',
  schedule: 'Schedule',
  teams: 'Teams',
  rules: 'Rules',
  admin: 'Admin',
};

const TABS = new Set<Tab>(['home', 'standings', 'schedule', 'teams', 'rules', 'admin']);

type AppRoute = { tab: Tab; gameId: string | null; teamId: string | null; playerId: string | null };

function parseRoute(pathname: string): AppRoute {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'games' && parts[1]) {
    return { tab: 'schedule', gameId: decodeURIComponent(parts[1]), teamId: null, playerId: null };
  }
  if (parts[0] === 'players' && parts[1]) {
    return { tab: 'teams', gameId: null, teamId: null, playerId: decodeURIComponent(parts[1]) };
  }
  const first = parts[0] === 'rosters' ? 'teams' : parts[0];
  if (first === 'teams' && parts[1]) {
    return { tab: 'teams', gameId: null, teamId: decodeURIComponent(parts[1]), playerId: null };
  }
  if (first && TABS.has(first as Tab)) return { tab: first as Tab, gameId: null, teamId: null, playerId: null };
  return { tab: 'home', gameId: null, teamId: null, playerId: null };
}

function pathForTab(tab: Tab): string {
  return tab === 'home' ? '/' : `/${tab}`;
}

function pathForGame(gameId: string): string {
  return `/games/${gameId}`;
}

function pathForTeam(teamId: string): string {
  return `/teams/${teamId}`;
}

function pathForPlayer(playerId: string): string {
  return `/players/${playerId}`;
}

function teamManagersOf(row?: { manager?: TeamManagerSummary | null; managers?: TeamManagerSummary[] } | null): TeamManagerSummary[] {
  if (!row) return [];
  if (row.managers && row.managers.length > 0) return row.managers;
  return row.manager ? [row.manager] : [];
}

function skillLabel(level?: SkillLevel | null): string | null {
  if (!level) return null;
  return SKILL_LEVEL_LABELS[level];
}

function waiverLabel(status?: WaiverStatus | null): string {
  return WAIVER_STATUS_LABELS[status ?? 'none'];
}

function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((next: string) => {
    if (next === window.location.pathname) return;
    window.history.pushState({}, '', next);
    setPath(next);
  }, []);
  return { route: parseRoute(path), navigate };
}

/** Admins manage any team; team managers only their assigned team. */
function canManageTeam(user: User | null, teamId: string | null): boolean {
  if (!user || !teamId) return false;
  if (user.role === 'admin') return true;
  return user.role === 'manager' && user.teamId === teamId;
}

/** Signed-in team members and admins can open team chat. */
function canOpenTeamChat(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || Boolean(user.teamId);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function App() {
  const { user } = useAuth();
  const { route, navigate } = useRoute();
  const tab = route.tab;
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [profileOpen, setProfileOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  function openAuth(mode: 'login' | 'register' = 'login') {
    setAuthMode(mode);
    setAuthOpen(true);
  }

  // If a non-admin lands on the admin tab (e.g. after logout), bounce them out.
  useEffect(() => {
    if (tab === 'admin' && user?.role !== 'admin') navigate('/');
  }, [tab, user, navigate]);

  useEffect(() => {
    if (!canOpenTeamChat(user)) setChatOpen(false);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    async function loadTheme() {
      try {
        const theme = await api.getTheme();
        if (!cancelled) applyTheme(theme);
      } catch {
        /* keep the last applied theme */
      }
    }
    void loadTheme();
    const timer = window.setInterval(() => void loadTheme(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="app-shell">
      <header className="app-bar">
        <div className="app-bar-inner">
          <img className="app-logo" src="/app-icon.svg" alt="" width="28" height="28" />
          <div className="app-bar-text">
            <span className="app-bar-title">Oakdale Mens Softball League</span>
            <span className="app-bar-sub">{route.gameId ? 'Game' : route.playerId ? 'Player' : TAB_TITLES[tab]}</span>
          </div>
          <div className="app-bar-actions">
            {canOpenTeamChat(user) && (
              <button
                className="chat-icon-btn"
                type="button"
                aria-label="Team chat"
                onClick={() => setChatOpen(true)}
              >
                <ChatIcon />
              </button>
            )}
            <AuthControl onSignIn={() => openAuth('login')} onEditProfile={() => setProfileOpen(true)} />
          </div>
        </div>
      </header>

      <main className="app-content">
        {tab === 'home' && <HomePage onOpenGame={(id) => navigate(pathForGame(id))} />}
        {tab === 'standings' && <Standings />}
        {tab === 'schedule' && route.gameId && (
          <GamePage gameId={route.gameId} onBack={() => navigate(pathForTab('schedule'))} />
        )}
        {tab === 'schedule' && !route.gameId && (
          <Schedule onOpenGame={(id) => navigate(pathForGame(id))} />
        )}
        {tab === 'teams' && route.playerId && (
          <PlayerProfilePage
            playerId={route.playerId}
            onBack={() => navigate(pathForTab('teams'))}
            onOpenTeam={(id) => navigate(pathForTeam(id))}
          />
        )}
        {tab === 'teams' && !route.teamId && !route.playerId && (
          <TeamsBoard
            onOpenTeam={(id) => navigate(pathForTeam(id))}
            onOpenPlayer={(id) => navigate(pathForPlayer(id))}
            onSignUp={() => openAuth('register')}
          />
        )}
        {tab === 'teams' && route.teamId && !route.playerId && (
          <TeamPage
            teamId={route.teamId}
            onBack={() => navigate(pathForTab('teams'))}
            onOpenPlayer={(id) => navigate(pathForPlayer(id))}
          />
        )}
        {tab === 'rules' && <Rules />}
        {tab === 'admin' && user?.role === 'admin' && <Admin />}
      </main>

      <nav className="tab-bar" role="tablist" aria-label="Main navigation">
        <TabButton tab="home" current={tab} onSelect={(next) => navigate(pathForTab(next))} label="Home" icon={HomeIcon} />
        <TabButton tab="standings" current={tab} onSelect={(next) => navigate(pathForTab(next))} label="Standings" icon={TrophyIcon} />
        <TabButton tab="schedule" current={tab} onSelect={(next) => navigate(pathForTab(next))} label="Schedule" icon={CalendarIcon} />
        <TabButton tab="teams" current={tab} onSelect={(next) => navigate(pathForTab(next))} label="Teams" icon={RosterIcon} />
        <TabButton tab="rules" current={tab} onSelect={(next) => navigate(pathForTab(next))} label="Rules" icon={RulesIcon} />
        {user?.role === 'admin' && (
          <TabButton tab="admin" current={tab} onSelect={(next) => navigate(pathForTab(next))} label="Admin" icon={GearIcon} />
        )}
      </nav>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} initialMode={authMode} />}
      {profileOpen && user && <ProfileModal onClose={() => setProfileOpen(false)} />}
      {chatOpen && user && canOpenTeamChat(user) && <TeamChatModal onClose={() => setChatOpen(false)} />}
    </div>
  );
}

function AuthControl({ onSignIn, onEditProfile }: { onSignIn: () => void; onEditProfile: () => void }) {
  const { user } = useAuth();
  if (!user) {
    return (
      <button className="signin-btn" onClick={onSignIn}>
        Sign in
      </button>
    );
  }
  return (
    <button
      className={`user-initials-btn${user.photoUrl ? ' has-photo' : ''}`}
      type="button"
      onClick={onEditProfile}
      aria-label="Edit profile"
    >
      {user.photoUrl ? <img src={user.photoUrl} alt="" /> : initials(user.name)}
    </button>
  );
}

function AuthModal({
  onClose,
  initialMode = 'login',
}: {
  onClose: () => void;
  initialMode?: 'login' | 'register';
}) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, name, password);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Sign in
          </button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            Create account
          </button>
        </div>
        <form onSubmit={submit} className="modal-form">
          {mode === 'register' && (
            <input
              aria-label="Full name"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          <input
            aria-label="Email"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            aria-label="Password"
            type="password"
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="error inline-error">{error}</p>}
          <button className="primary-btn" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
    </div>
  );
}

function ProfileModal({ onClose }: { onClose: () => void }) {
  const { user, refresh, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [position, setPosition] = useState(user?.position ?? '');
  const [number, setNumber] = useState(user?.number != null ? String(user.number) : '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(user?.photoUrl ?? null);
  const [onRoster, setOnRoster] = useState(user?.onRoster !== false);
  const [skillLevel, setSkillLevel] = useState<SkillLevel | ''>(user?.skillLevel ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [sharePhone, setSharePhone] = useState(user?.sharePhone === true);
  const [waiverUrl, setWaiverUrl] = useState<string | null>(user?.waiverUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPickPhoto(file: File) {
    try {
      setPhotoUrl(await fileToSquareDataUrl(file));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onPickWaiver(file: File) {
    try {
      setWaiverUrl(await fileToWaiverDataUrl(file));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const parsedNumber = number.trim() === '' ? null : Number(number);
      await api.updateProfile({
        name,
        position,
        number: parsedNumber,
        photoUrl,
        skillLevel: skillLevel || null,
        phone: phone.trim() || null,
        sharePhone,
        waiverUrl,
        ...(user?.role === 'manager' ? { onRoster } : {}),
      });
      await refresh();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Your profile</h2>
        <form onSubmit={submit} className="modal-form">
          <PhotoPicker
            id="profile-photo"
            label="Profile photo"
            value={photoUrl}
            onFile={onPickPhoto}
          />
          <label className="field">
            Name
            <input
              aria-label="Full name"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="field">
            Position
            <input
              aria-label="Position"
              placeholder="Position"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </label>
          <label className="field">
            Number
            <input
              aria-label="Jersey number"
              placeholder="#"
              type="number"
              min={0}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </label>
          <label className="field">
            Skill level
            <select
              aria-label="Skill level"
              value={skillLevel}
              onChange={(e) => setSkillLevel(e.target.value as SkillLevel | '')}
            >
              <option value="">Not set</option>
              {SKILL_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {SKILL_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
          </label>
          <div className="phone-share">
            <label className="field">
              Phone
              <input
                aria-label="Phone number"
                type="tel"
                placeholder="(209) 555-0100"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={sharePhone}
                onChange={(e) => setSharePhone(e.target.checked)}
              />
              Let managers see my number
            </label>
            <p className="muted-copy field-hint">
              Off by default. Managers use this to reach you about a game.
            </p>
          </div>
          <div className="waiver-upload">
            <p className="waiver-status">
              {waiverLabel(user?.waiverStatus)}
              {waiverUrl ? ' · file attached' : ''}
            </p>
            <label className="field">
              Signed waiver
              <input
                aria-label="Upload signed waiver"
                type="file"
                accept="image/*,.pdf,application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onPickWaiver(file);
                }}
              />
            </label>
          </div>
          {user?.role === 'manager' && (
            <label className="field">
              I play for the team I manage
              <select
                aria-label="Manager roster option"
                value={onRoster ? 'player' : 'only'}
                onChange={(e) => setOnRoster(e.target.value === 'player')}
              >
                <option value="player">Yes — on my team&apos;s roster</option>
                <option value="only">No — manager only, not on the roster</option>
              </select>
            </label>
          )}
          {error && <p className="error inline-error">{error}</p>}
          <button className="primary-btn" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save profile'}
          </button>
          <button
            type="button"
            className="link-btn profile-signout"
            onClick={() => {
              void logout().then(onClose);
            }}
          >
            Sign out
          </button>
        </form>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
    </div>
  );
}

function PhotoPicker({
  id,
  label,
  value,
  onFile,
  onClear,
}: {
  id: string;
  label: string;
  value: string | null | undefined;
  onFile: (file: File) => void | Promise<void>;
  onClear?: () => void;
}) {
  return (
    <div className="photo-picker">
      {value ? (
        <img className="photo-preview" src={value} alt="" />
      ) : (
        <div className="photo-preview photo-preview-empty" aria-hidden="true" />
      )}
      <div className="photo-picker-actions">
        <label className="photo-picker-label" htmlFor={id}>
          {label}
          <input
            id={id}
            type="file"
            accept="image/*"
            aria-label={label}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
              e.target.value = '';
            }}
          />
        </label>
        {onClear && value ? (
          <button type="button" className="link-btn" onClick={onClear}>
            Remove image
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TabButton({
  tab,
  current,
  onSelect,
  label,
  icon: Icon,
}: {
  tab: Tab;
  current: Tab;
  onSelect: (t: Tab) => void;
  label: string;
  icon: () => JSX.Element;
}) {
  const active = tab === current;
  return (
    <button
      className={`tab-item ${active ? 'active' : ''}`}
      role="tab"
      aria-selected={active}
      aria-label={label}
      onClick={() => onSelect(tab)}
    >
      <Icon />
      <span>{label}</span>
    </button>
  );
}

const IN_MARK = '🥎';
const OUT_MARK = '🚫';

function checkInMark(status: 'in' | 'out' | null | undefined): string {
  if (status === 'in') return IN_MARK;
  if (status === 'out') return OUT_MARK;
  return '—';
}

function nextGameForTeam(games: Game[], teamId: string): Game | null {
  const upcoming = games
    .filter((g) => (g.homeTeamId === teamId || g.awayTeamId === teamId) && !g.played)
    .slice()
    .sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`));
  if (upcoming.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  return upcoming.find((g) => g.date >= today) ?? upcoming[0];
}

function HomePage({ onOpenGame }: { onOpenGame: (id: string) => void }) {
  const { user } = useAuth();
  if (user && (user.role === 'player' || user.role === 'manager')) {
    return <PlayerHome onOpenGame={onOpenGame} />;
  }
  return <LeagueLanding />;
}

function PlayerHome({ onOpenGame }: { onOpenGame: (id: string) => void }) {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [currentWeek, setCurrentWeek] = useState<CurrentWeek | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const teamId = user?.teamId ?? null;
  const team = teams.find((t) => t.id === teamId) ?? null;
  const nextGame = teamId ? nextGameForTeam(games, teamId) : null;
  const playsOnTeam = Boolean(
    teamId && (user?.role === 'player' || (user?.role === 'manager' && user.onRoster !== false)),
  );
  const checkWeek = nextGame?.week ?? currentWeek?.week ?? null;
  const checkDate = nextGame?.date ?? currentWeek?.date ?? null;
  const myCheckIn = members.find((m) => m.id === user?.id)?.checkIn ?? null;
  const checkInCounts = {
    in: members.filter((m) => m.checkIn === 'in').length,
    out: members.filter((m) => m.checkIn === 'out').length,
    none: members.filter((m) => m.checkIn !== 'in' && m.checkIn !== 'out').length,
  };

  function loadRoster(id: string) {
    api
      .getRoster(id)
      .then((r) => {
        setMembers(r.members ?? []);
        setCurrentWeek(r.currentWeek ?? null);
        setTeams((prev) => {
          const next = prev.map((t) => (t.id === r.team.id ? r.team : t));
          return next.some((t) => t.id === r.team.id) ? next : [...next, r.team];
        });
      })
      .catch((e) => setError((e as Error).message));
  }

  useEffect(() => {
    Promise.all([api.getTeams(), api.getSchedule()])
      .then(([nextTeams, nextGames]) => {
        setTeams(nextTeams);
        setGames(nextGames);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!teamId) {
      setMembers([]);
      setCurrentWeek(null);
      return;
    }
    loadRoster(teamId);
  }, [teamId]);

  async function handleCheckIn(status: 'in' | 'out') {
    if (checkWeek == null) return;
    const next = myCheckIn === status ? null : status;
    setError(null);
    setCheckingIn(true);
    try {
      await api.checkIn(checkWeek, next);
      if (teamId) loadRoster(teamId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCheckingIn(false);
    }
  }

  const opponent = nextGame
    ? nextGame.homeTeamId === teamId
      ? nextGame.awayTeamName
      : nextGame.homeTeamName
    : null;
  const vsLabel = nextGame
    ? nextGame.homeTeamId === teamId
      ? `vs ${opponent}`
      : `at ${opponent}`
    : null;

  return (
    <div className="landing player-home">
      <section className="card player-home-card">
        <p className="player-home-hello">Hey {user?.name?.split(' ')[0] || 'there'}</p>
        <h1 className="player-home-team">{team?.name ?? (teamId ? (ready ? 'Your team' : 'Loading…') : 'No team yet')}</h1>
        {!teamId && ready && (
          <p className="muted-copy player-home-empty">
            Join a team from Teams to see your next game and check in.
          </p>
        )}
        {teamId && ready && !nextGame && (
          <p className="muted-copy player-home-empty">No upcoming games on the schedule.</p>
        )}
        {nextGame && (
          <button
            type="button"
            className="player-next-game"
            onClick={() => onOpenGame(nextGame.id)}
            aria-label={`Open next game ${vsLabel} on ${formatGameDate(nextGame.date)}`}
          >
            <span className="player-next-kicker">Next game</span>
            <span className="player-next-matchup">{vsLabel}</span>
            <span className="player-next-when">{formatGameDate(nextGame.date)}</span>
            <dl className="player-next-meta">
              <div>
                <dt>Field</dt>
                <dd>{nextGame.field || 'TBD'}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>{nextGame.time || 'TBD'}</dd>
              </div>
            </dl>
          </button>
        )}
      </section>

      {teamId && checkWeek != null && checkDate && (
        <section className="card">
          <div className="checkin-panel player-home-checkin">
            <h2 className="checkin-heading">
              Check-in — Week {checkWeek} · {formatGameDate(checkDate)}
            </h2>
            {members.length > 0 && (
              <p className="checkin-summary">
                {IN_MARK} {checkInCounts.in} · {OUT_MARK} {checkInCounts.out} · — {checkInCounts.none}
              </p>
            )}
            {playsOnTeam ? (
              <div className="checkin-actions">
                <button
                  type="button"
                  className={`checkin-btn${myCheckIn === 'in' ? ' active-in' : ''}`}
                  aria-pressed={myCheckIn === 'in'}
                  aria-label="I'm there"
                  disabled={checkingIn}
                  onClick={() => handleCheckIn('in')}
                >
                  <span className="checkin-emoji" aria-hidden="true">
                    {IN_MARK}
                  </span>
                  I&apos;m there
                </button>
                <button
                  type="button"
                  className={`checkin-btn${myCheckIn === 'out' ? ' active-out' : ''}`}
                  aria-pressed={myCheckIn === 'out'}
                  aria-label="Can't make it"
                  disabled={checkingIn}
                  onClick={() => handleCheckIn('out')}
                >
                  <span className="checkin-emoji" aria-hidden="true">
                    {OUT_MARK}
                  </span>
                  Can&apos;t make it
                </button>
              </div>
            ) : (
              <p className="theme-help">Manager-only accounts do not check in.</p>
            )}
            {error && <p className="error inline-error">{error}</p>}
          </div>
        </section>
      )}

      <SuggestionsBox />
    </div>
  );
}

function LeagueLanding() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [landing, setLanding] = useState<Landing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [countdownLabel, setCountdownLabel] = useState('');
  const [countdownTarget, setCountdownTarget] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function applyLanding(next: Landing) {
    setLanding(next);
    setHeadline(next.headline);
    setBody(next.body);
    setCountdownLabel(next.countdownLabel);
    setCountdownTarget(toDatetimeLocalValue(next.countdownTarget));
    setImageUrl(next.imageUrl);
  }

  useEffect(() => {
    api
      .getLanding()
      .then(applyLanding)
      .catch((e) => setError((e as Error).message));
  }, []);

  function startEdit() {
    if (!landing) return;
    applyLanding(landing);
    setMessage(null);
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    if (landing) applyLanding(landing);
    setEditing(false);
    setError(null);
  }

  async function onPickBanner(file: File) {
    try {
      setImageUrl(await fileToBannerDataUrl(file));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const next = await api.updateLanding({
        headline,
        body,
        countdownLabel,
        countdownTarget: fromDatetimeLocalValue(countdownTarget),
        imageUrl,
      });
      applyLanding(next);
      setEditing(false);
      setMessage('Landing page saved!');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !landing) return <p className="error">{error}</p>;
  if (!landing) return <p className="muted-copy">Loading home…</p>;

  return (
    <div className="landing">
      <section className="landing-hero">
        <img className="landing-logo" src="/app-icon.svg" alt="" width="56" height="56" />
        <p className="landing-league">Oakdale Mens Softball League</p>
        <h1 className="landing-headline">{landing.headline}</h1>
      </section>

      {landing.imageUrl && (
        <img className="landing-banner" src={landing.imageUrl} alt="" />
      )}

      <CountdownCard label={landing.countdownLabel} target={landing.effectiveCountdownTarget} />

      {isAdmin && (
        <section className="card">
          <ColorSchemeAdmin onError={setError} onMessage={setMessage} />
        </section>
      )}

      <section className="card landing-announcement">
        <div className="landing-announcement-head">
          <h2>Announcements</h2>
          {isAdmin && !editing && (
            <button className="mini-btn" type="button" onClick={startEdit}>
              Edit
            </button>
          )}
        </div>
        {message && <p className="message">{message}</p>}
        {editing ? (
          <form
            className="landing-editor"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="field">
              Headline
              <input
                aria-label="Headline"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                maxLength={200}
                required
              />
            </label>
            <label className="field">
              Announcement
              <textarea
                className="rules-textarea"
                aria-label="Announcement"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                maxLength={5000}
              />
            </label>
            <label className="field">
              Countdown label
              <input
                aria-label="Countdown label"
                value={countdownLabel}
                onChange={(e) => setCountdownLabel(e.target.value)}
                maxLength={80}
              />
            </label>
            <label className="field">
              Countdown target
              <input
                aria-label="Countdown target"
                type="datetime-local"
                value={countdownTarget}
                onChange={(e) => setCountdownTarget(e.target.value)}
              />
            </label>
            <PhotoPicker
              id="landing-banner"
              label="Banner image"
              value={imageUrl}
              onFile={onPickBanner}
              onClear={() => setImageUrl(null)}
            />
            {error && <p className="error inline-error">{error}</p>}
            <div className="rules-actions">
              <button className="primary-btn" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className="link-btn" type="button" onClick={cancelEdit} disabled={saving}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="landing-body">{landing.body}</div>
        )}
      </section>

      <SuggestionsBox />
    </div>
  );
}

function SuggestionsBox() {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [name, setName] = useState(user?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    if (user?.name && !name) setName(user.name);
  }, [user?.name, name]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: { text: string; name?: string } = { text };
      const trimmedName = name.trim();
      if (trimmedName) payload.name = trimmedName;
      await api.submitSuggestion(payload);
      setText('');
      setName(user?.name ?? '');
      setThanks(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card landing-suggestions">
      <h2>Suggestions</h2>
      {/* Routing suggestions to an external place can be added later; for now admins view them in-app. */}
      {thanks ? (
        <div className="suggestions-thanks">
          <p className="message">Thanks for the suggestion!</p>
          <button className="link-btn" type="button" onClick={() => setThanks(false)}>
            Send another
          </button>
        </div>
      ) : (
        <form className="suggestions-form" onSubmit={submit}>
          <label className="field">
            Suggestion
            <textarea
              aria-label="Suggestion"
              placeholder="Ideas for the league, fields, schedule…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              maxLength={2000}
              required
            />
          </label>
          <label className="field">
            Your name (optional)
            <input
              aria-label="Your name (optional)"
              placeholder="Anonymous if left blank"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </label>
          {error && <p className="error inline-error">{error}</p>}
          <button className="primary-btn" type="submit" disabled={busy || !text.trim()}>
            {busy ? 'Sending…' : 'Submit'}
          </button>
        </form>
      )}
    </section>
  );
}

function formatMessageTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  const diff = Date.now() - parsed.getTime();
  if (diff < 45_000) return 'just now';
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m`;
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))}h`;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function TeamChatModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string>(isAdmin ? '' : user?.teamId ?? '');
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .getTeams()
      .then((next) => {
        setTeams(next);
        setTeamId((current) => current || user?.teamId || next[0]?.id || '');
      })
      .catch((err) => setError((err as Error).message));
  }, [user?.teamId]);

  useEffect(() => {
    if (!teamId) return undefined;
    let cancelled = false;

    async function load() {
      try {
        const next = await api.getTeamMessages(teamId);
        if (!cancelled) {
          setMessages(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [teamId]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const activeTeam = teams.find((t) => t.id === teamId);
  const title = isAdmin
    ? activeTeam
      ? `${activeTeam.name} chat`
      : 'Team chat'
    : activeTeam
      ? `${activeTeam.name}`
      : 'Team chat';

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId || !draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const posted = await api.sendTeamMessage(teamId, draft);
      setMessages((prev) => [...prev.filter((m) => m.id !== posted.id), posted]);
      setDraft('');
      const latest = await api.getTeamMessages(teamId);
      setMessages(latest);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal chat-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Team chat">
        <h2 className="modal-title">{title}</h2>
        {isAdmin && (
          <label className="field chat-team-picker">
            Team
            <select
              aria-label="Chat team"
              value={teamId}
              onChange={(e) => {
                setTeamId(e.target.value);
                setMessages([]);
              }}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="chat-messages" ref={listRef}>
          {messages.length === 0 ? (
            <p className="chat-empty">No messages yet. Say hi to the team.</p>
          ) : (
            messages.map((m) => {
              const mine = m.userId === user?.id;
              return (
                <div key={m.id} className={`chat-bubble ${mine ? 'mine' : ''}`}>
                  <div className="chat-bubble-meta">
                    <span className="chat-bubble-author">{m.authorName}</span>
                    <span className="chat-bubble-time">{formatMessageTime(m.createdAt)}</span>
                  </div>
                  <p className="chat-bubble-text">{m.text}</p>
                </div>
              );
            })
          )}
        </div>
        {error && <p className="error inline-error">{error}</p>}
        <form className="chat-compose" onSubmit={send}>
          <input
            aria-label="Message"
            placeholder="Message the team…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
            autoComplete="off"
          />
          <button className="primary-btn" type="submit" disabled={busy || !draft.trim() || !teamId}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </form>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
    </div>
  );
}

function toDatetimeLocalValue(value: string | null): string {
  if (!value) return '';
  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  if (match) return match[1];
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length === 16 ? `${trimmed}:00` : trimmed;
}

function CountdownCard({ label, target }: { label: string; target: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);

  if (!target) return null;

  const targetMs = new Date(target).getTime();
  if (Number.isNaN(targetMs)) return null;

  if (targetMs <= now) {
    return (
      <section className="card landing-countdown">
        <p className="countdown-underway">The season is underway!</p>
      </section>
    );
  }

  const parts = remainingParts(targetMs, now);
  const seconds = String(parts.seconds).padStart(2, '0');
  const phrase = `${label} in ${parts.days}d ${parts.hours}h ${parts.minutes}m ${seconds}s`;

  return (
    <section className="card landing-countdown">
      <p className="countdown-label">{label}</p>
      <div className="countdown-units" aria-hidden="true">
        <CountdownUnit value={parts.days} unit="days" />
        <CountdownUnit value={parts.hours} unit="hrs" />
        <CountdownUnit value={parts.minutes} unit="min" />
        <CountdownUnit value={seconds} unit="sec" />
      </div>
      <p className="countdown-phrase" aria-live="polite">
        {phrase}
      </p>
    </section>
  );
}

function remainingParts(targetMs: number, nowMs: number) {
  let ms = Math.max(0, targetMs - nowMs);
  const days = Math.floor(ms / 86_400_000);
  ms %= 86_400_000;
  const hours = Math.floor(ms / 3_600_000);
  ms %= 3_600_000;
  const minutes = Math.floor(ms / 60_000);
  ms %= 60_000;
  const seconds = Math.floor(ms / 1000);
  return { days, hours, minutes, seconds };
}

function CountdownUnit({ value, unit }: { value: number | string; unit: string }) {
  return (
    <div className="countdown-unit">
      <strong>{value}</strong>
      <span>{unit}</span>
    </div>
  );
}

function Standings() {
  const [rows, setRows] = useState<StandingRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getStandings().then(setRows).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;

  return (
    <section className="card">
      <h2>League Standings</h2>
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>W</th>
            <th>L</th>
            <th>T</th>
            <th>GP</th>
            <th>RF</th>
            <th>RA</th>
            <th>Diff</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.teamId}>
              <td>{i + 1}</td>
              <td className="team-cell">{r.teamName}</td>
              <td>{r.wins}</td>
              <td>{r.losses}</td>
              <td>{r.ties}</td>
              <td>{r.gamesPlayed}</td>
              <td>{r.runsFor}</td>
              <td>{r.runsAgainst}</td>
              <td>{r.runsFor - r.runsAgainst >= 0 ? '+' : ''}{r.runsFor - r.runsAgainst}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatGameDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[date.getUTCDay()]} ${MONTHS[m - 1]} ${d}`;
}

const EMPTY_LINE = [0, 0, 0, 0, 0, 0, 0];

const EMPTY_BOX: GameBoxScore = {
  homeRuns: 0,
  awayRuns: 0,
  homeHits: 0,
  awayHits: 0,
  homeWalks: 0,
  awayWalks: 0,
  homeOuts: 0,
  awayOuts: 0,
  currentOuts: 0,
  awayLine: EMPTY_LINE,
  homeLine: EMPTY_LINE,
  currentInning: 1,
  currentHalf: 'top',
  batterUp: 'away',
};

function gameBox(game: Game): GameBoxScore {
  const raw = game.box ?? {
    ...EMPTY_BOX,
    homeRuns: game.homeScore ?? 0,
    awayRuns: game.awayScore ?? 0,
  };
  return {
    ...EMPTY_BOX,
    ...raw,
    awayLine: raw.awayLine && raw.awayLine.length ? raw.awayLine : EMPTY_LINE,
    homeLine: raw.homeLine && raw.homeLine.length ? raw.homeLine : EMPTY_LINE,
    currentInning: raw.currentInning ?? 1,
    currentHalf: raw.currentHalf ?? 'top',
    batterUp: raw.batterUp ?? 'away',
  };
}

function scoringPhaseLabel(phase: ScoringPhase | undefined): string {
  if (phase === 'live') return 'LIVE';
  if (phase === 'grace') return 'OPEN';
  if (phase === 'locked') return 'FINAL';
  return 'UPCOMING';
}

function teamAbbr(name: string): string {
  const words = String(name ?? '')
    .replace(/&/g, ' ')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((word) => word[0] ?? '')
      .join('')
      .toUpperCase();
  }
  return (words[0] ?? name).slice(0, 3).toUpperCase();
}

const MARK_COLORS = [
  { bg: '#e41e2d', fg: '#ffffff' },
  { bg: '#0a2240', fg: '#ffffff' },
  { bg: '#14532d', fg: '#facc15' },
  { bg: '#7c2d12', fg: '#fde68a' },
  { bg: '#1d4ed8', fg: '#ffffff' },
  { bg: '#334155', fg: '#f8fafc' },
  { bg: '#854d0e', fg: '#fef3c7' },
  { bg: '#4c1d95', fg: '#f5f3ff' },
];

function markColors(teamId: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < teamId.length; i += 1) hash = (hash * 31 + teamId.charCodeAt(i)) >>> 0;
  return MARK_COLORS[hash % MARK_COLORS.length];
}

function remainingLabel(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

function GameScoreLabel({ game }: { game: Game }) {
  const box = gameBox(game);
  const phase = game.scoring?.phase;
  const hasRuns = game.played || box.homeRuns > 0 || box.awayRuns > 0 || Boolean(game.scoring?.liveStartedAt);
  const score = `${box.awayRuns}–${box.homeRuns}`;
  if (phase === 'live') {
    return <span className="game-score live">{hasRuns ? `LIVE ${score}` : 'LIVE'}</span>;
  }
  if (hasRuns || phase === 'grace' || phase === 'locked') {
    return <span className="game-score">{score}</span>;
  }
  return <span className="game-score">Upcoming</span>;
}

const EMPTY_ATTENDANCE: TeamAttendance = { in: 0, out: 0, none: 0, total: 0 };

function attendanceOf(value?: TeamAttendance | null): TeamAttendance {
  return value ?? EMPTY_ATTENDANCE;
}

function AttendanceChip({ attendance }: { attendance?: TeamAttendance | null }) {
  const a = attendanceOf(attendance);
  if (a.total === 0) {
    return (
      <span className="att-chip att-empty" aria-label="No roster accounts">
        —
      </span>
    );
  }
  return (
    <span className="att-chip" aria-label={`${a.in} of ${a.total} checked in`}>
      🥎 {a.in}/{a.total}
    </span>
  );
}

function AttendanceBreakdown({ name, attendance }: { name: string; attendance?: TeamAttendance | null }) {
  const a = attendanceOf(attendance);
  const shortHanded = a.total > 0 && a.in < 8;
  return (
    <p className="game-att-line">
      <span className="game-att-name">{name}:</span> {IN_MARK} {a.in} · {OUT_MARK} {a.out} · — {a.none}
      {shortHanded ? <span className="att-short"> short-handed</span> : null}
    </p>
  );
}

function groupGamesByWeek(games: Game[]): { week: number; date: string; games: Game[] }[] {
  const groups: { week: number; date: string; games: Game[] }[] = [];
  for (const g of games) {
    const last = groups[groups.length - 1];
    if (last && last.week === g.week) {
      last.games.push(g);
    } else {
      groups.push({ week: g.week, date: g.date, games: [g] });
    }
  }
  return groups;
}

function GameRow({ game, onOpen }: { game: Game; onOpen: (id: string) => void }) {
  return (
    <li className={`game ${game.played ? 'played' : 'upcoming'}`}>
      <button
        type="button"
        className="game-toggle"
        aria-label={`Open game: ${game.awayTeamName} at ${game.homeTeamName} on ${formatGameDate(game.date)}`}
        onClick={() => onOpen(game.id)}
      >
        <span className="game-date">{formatGameDate(game.date)}</span>
        <span className="game-teams">
          <span className="game-team">
            {game.awayTeamName} <AttendanceChip attendance={game.awayAttendance} />
          </span>
          <span className="at">@</span>
          <span className="game-team">
            {game.homeTeamName} <AttendanceChip attendance={game.homeAttendance} />
          </span>
        </span>
        <GameScoreLabel game={game} />
        <span className="game-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      </button>
    </li>
  );
}

function Schedule({ onOpenGame }: { onOpenGame: (id: string) => void }) {
  const { user } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [weeks, setWeeks] = useState('11');
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin';
  const weekGroups = useMemo(() => groupGamesByWeek(games), [games]);
  const liveGames = useMemo(
    () => games.filter((g) => g.scoring?.phase === 'live' || g.scoring?.phase === 'grace'),
    [games],
  );

  function load() {
    api.getSchedule().then(setGames).catch((e) => setError(e.message));
  }
  useEffect(load, [user?.id, user?.role, user?.teamId]);

  async function handleGenerate() {
    setGenerating(true);
    setMessage(null);
    setError(null);
    try {
      const weeksNum = Number(weeks);
      const next = await api.generateSchedule(
        startDate || undefined,
        Number.isInteger(weeksNum) ? weeksNum : undefined,
      );
      setGames(next);
      setMessage(`Generated ${next.length} games from the current teams.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  if (error) return <p className="error">{error}</p>;

  return (
    <section className="card">
      <h2>Season Schedule</h2>
      {isAdmin && (
        <div className="generate-bar">
          <label className="field inline">
            Opener date:{' '}
            <input
              aria-label="Opener date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="field inline">
            Weeks:{' '}
            <input
              aria-label="Weeks"
              type="number"
              min={1}
              max={30}
              value={weeks}
              onChange={(e) => setWeeks(e.target.value)}
            />
          </label>
          <button className="generate-btn" onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating…' : 'Generate schedule from teams'}
          </button>
        </div>
      )}
      {message && <p className="message">{message}</p>}
      {liveGames.length > 0 && (
        <div className="live-now" aria-label="Live games">
          <h3 className="week-heading">Live now</h3>
          <ul className="games">
            {liveGames.map((g) => (
              <GameRow key={`live-${g.id}`} game={g} onOpen={onOpenGame} />
            ))}
          </ul>
        </div>
      )}
      {weekGroups.map((group) => (
        <div key={`${group.week}-${group.date}`} className="week-group">
          <h3 className="week-heading">
            {group.week ? `Week ${group.week} — ${formatGameDate(group.date)}` : formatGameDate(group.date)}
          </h3>
          <ul className="games">
            {group.games.map((g) => (
              <GameRow key={g.id} game={g} onOpen={onOpenGame} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function GamePage({ gameId, onBack }: { gameId: string; onBack: () => void }) {
  const { user } = useAuth();
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const shouldPoll = game?.scoring?.phase === 'live' || game?.scoring?.phase === 'grace';

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .getGame(gameId)
      .then((next) => {
        if (!cancelled) setGame(next);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, user?.id, user?.role, user?.teamId]);

  useEffect(() => {
    if (!shouldPoll) return;
    const timer = window.setInterval(() => {
      api
        .getGame(gameId)
        .then(setGame)
        .catch(() => {
          /* keep last good snapshot */
        });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [shouldPoll, gameId]);

  if (error) {
    return (
      <section className="card game-page">
        <button type="button" className="back-link" onClick={onBack} aria-label="Back to schedule">
          ← Schedule
        </button>
        <p className="error">{error}</p>
      </section>
    );
  }
  if (!game) {
    return (
      <section className="card game-page">
        <button type="button" className="back-link" onClick={onBack} aria-label="Back to schedule">
          ← Schedule
        </button>
        <p>Loading game…</p>
      </section>
    );
  }

  return (
    <section className="card game-page">
      <button type="button" className="back-link" onClick={onBack} aria-label="Back to schedule">
        ← Schedule
      </button>
      <h2>
        {game.awayTeamName} at {game.homeTeamName}
      </h2>
      <p className="game-page-when">
        {formatGameDate(game.date)}
        {game.time ? ` · ${game.time}` : ''}
        {game.week ? ` · Week ${game.week}` : ''}
      </p>
      {message && <p className="message">{message}</p>}
      <LiveScoreboard game={game} onChanged={setGame} onMessage={setMessage} onError={setError} />
      <dl className="game-meta">
        <div>
          <dt>Time</dt>
          <dd>{game.time || 'TBD'}</dd>
        </div>
        <div>
          <dt>Field</dt>
          <dd>{game.field || 'TBD'}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{game.location || 'Kerr Park'}</dd>
        </div>
        <div>
          <dt>Week</dt>
          <dd>{game.week || '—'}</dd>
        </div>
      </dl>
      <div className="game-attendance">
        <AttendanceBreakdown name={game.awayTeamName} attendance={game.awayAttendance} />
        <AttendanceBreakdown name={game.homeTeamName} attendance={game.homeAttendance} />
      </div>
      <GameLineups game={game} onChanged={setGame} onMessage={setMessage} onError={setError} />
    </section>
  );
}

function lineFor(box: GameBoxScore, side: ScoreSide): number[] {
  const line = side === 'home' ? box.homeLine : box.awayLine;
  return line && line.length ? line : EMPTY_LINE;
}

function TeamMark({ name, teamId, photoUrl }: { name: string; teamId: string; photoUrl?: string }) {
  const abbr = teamAbbr(name);
  const colors = markColors(teamId);
  return (
    <span className="mlb-mark" style={{ background: colors.bg, color: colors.fg }} title={name}>
      {photoUrl ? <img src={photoUrl} alt="" /> : <span>{abbr.slice(0, 2)}</span>}
    </span>
  );
}

function LiveScoreboard({
  game,
  onChanged,
  onMessage,
  onError,
}: {
  game: Game;
  onChanged: (game: Game) => void;
  onMessage: (text: string | null) => void;
  onError: (text: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<Record<string, string | undefined>>({});
  const box = gameBox(game);
  const scoring = game.scoring;
  const phase = scoring?.phase ?? 'upcoming';
  const canStart = Boolean(scoring?.canStart);
  const canScore = Boolean(scoring?.canScore);
  const remaining =
    phase === 'live'
      ? remainingLabel(scoring?.liveEndsAt)
      : phase === 'grace'
        ? remainingLabel(scoring?.closesAt)
        : phase === 'upcoming'
          ? remainingLabel(scoring?.opensAt)
          : null;
  const hint =
    phase === 'live'
      ? remaining
        ? `${remaining} left`
        : ''
      : phase === 'grace'
        ? remaining
          ? `${remaining} to edit`
          : ''
        : phase === 'locked'
          ? ''
          : remaining
            ? remaining
            : '';

  useEffect(() => {
    api
      .getTeams()
      .then((list) => {
        const next: Record<string, string | undefined> = {};
        for (const team of list) next[team.id] = team.photoUrl;
        setPhotos(next);
      })
      .catch(() => {
        /* marks still render initials */
      });
  }, []);

  async function run(action: () => Promise<Game>, ok?: string) {
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      const next = await action();
      onChanged(next);
      if (ok) onMessage(ok);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scoreboard mlb-board">
      <div className="mlb-matchup" aria-label="Live box score">
        <TeamMark name={game.awayTeamName} teamId={game.awayTeamId} photoUrl={photos[game.awayTeamId]} />
        <span className="mlb-runs">{box.awayRuns}</span>
        <div className="mlb-status" title={hint || undefined}>
          <span className={`mlb-phase phase-${phase}`}>{scoringPhaseLabel(phase)}</span>
        </div>
        <span className="mlb-runs">{box.homeRuns}</span>
        <TeamMark name={game.homeTeamName} teamId={game.homeTeamId} photoUrl={photos[game.homeTeamId]} />
      </div>
      <hr className="mlb-rule" />
      <LineScore
        gameId={game.id}
        awayName={game.awayTeamName}
        homeName={game.homeTeamName}
        box={box}
        canScore={canScore}
        busy={busy}
        onRun={(action) => run(action)}
      />
      <div className="inning-outs">
        <div className="inning-outs-copy">
          <span className="mlb-outs-label">Outs</span>
          <span className="inning-outs-dots" aria-label={`${box.currentOuts} outs`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={`out-dot ${i < box.currentOuts ? 'on' : ''}`} />
            ))}
          </span>
          {canScore && (
            <div className="inning-outs-actions">
              <button
                type="button"
                className="score-step"
                disabled={busy || (box.currentOuts === 0 && box.currentInning === 1 && box.currentHalf === 'top')}
                aria-label="Remove an out this inning"
                onClick={() => run(() => api.bumpCurrentOuts(game.id, -1))}
              >
                −
              </button>
              <button
                type="button"
                className="score-step"
                disabled={busy}
                aria-label="Add an out this inning"
                onClick={() => run(() => api.bumpCurrentOuts(game.id, 1))}
              >
                +
              </button>
            </div>
          )}
        </div>
        <div className="batter-up">
          <p
            className="batter-slot"
            aria-label={`Batter up ${playerLabel(battingLineup(game, box)?.atBat) || battingTeamName(game, box)}`}
          >
            <span className="mlb-outs-label">Batter up</span>
            <strong>{playerLabel(battingLineup(game, box)?.atBat) || battingTeamName(game, box)}</strong>
            {battingLineup(game, box)?.atBat?.stats && (
              <span className="batter-stats">{compactStatLine(battingLineup(game, box)?.atBat?.stats)}</span>
            )}
          </p>
          <p
            className="batter-slot"
            aria-label={`On deck ${playerLabel(battingLineup(game, box)?.onDeck) || 'none'}`}
          >
            <span className="mlb-outs-label">On deck</span>
            <strong>{playerLabel(battingLineup(game, box)?.onDeck) || '—'}</strong>
          </p>
          <span className="batter-half">
            {box.currentHalf === 'bottom' ? 'Bot' : 'Top'} {box.currentInning} · {battingTeamName(game, box)}
          </span>
        </div>
      </div>
      {canScore && (
        <PlayLogPad
          game={game}
          busy={busy}
          onRun={(action) => run(action)}
        />
      )}
      {!canScore && (game.plays?.length ?? 0) > 0 && <PlayByPlayList plays={game.plays ?? []} />}
      {canStart && (
        <button
          type="button"
          className="start-live-btn"
          disabled={busy}
          onClick={() => run(() => api.startLiveGame(game.id), 'Live scorekeeping started.')}
        >
          Start live scorekeeping
        </button>
      )}
      {!canScore && !canStart && phase === 'upcoming' && (
        <p className="scoreboard-note">Team managers can keep score from 2 hours before first pitch through 24 hours after the game.</p>
      )}
    </div>
  );
}

function battingTeamName(game: Game, box: GameBoxScore): string {
  return box.batterUp === 'home' ? game.homeTeamName : game.awayTeamName;
}

function battingLineup(game: Game, box: GameBoxScore): GameLineup | undefined {
  return box.batterUp === 'home' ? game.lineups?.home : game.lineups?.away;
}

function playerLabel(player?: LineupPlayer | null): string {
  if (!player) return '';
  return player.number != null ? `#${player.number} ${player.name}` : player.name;
}

const PLAY_BUTTONS: Array<{ result: PlayResult; label: string }> = [
  { result: 'single', label: 'Single' },
  { result: 'double', label: 'Double' },
  { result: 'triple', label: 'Triple' },
  { result: 'homer', label: 'HR' },
  { result: 'out', label: 'Out' },
  { result: 'strikeout', label: 'K' },
];

function playLabel(result: string): string {
  switch (result) {
    case 'single':
      return 'Single';
    case 'double':
      return 'Double';
    case 'triple':
      return 'Triple';
    case 'homer':
      return 'Home run';
    case 'out':
      return 'Out';
    case 'strikeout':
      return 'Strikeout';
    case 'walk':
      return 'Walk';
    default:
      return result;
  }
}

function playHalfLabel(play: GamePlay): string {
  const half = play.half === 'bottom' ? 'Bot' : play.half === 'top' ? 'Top' : '';
  if (!half && play.inning == null) return '';
  return `${half} ${play.inning ?? ''}`.trim();
}

function compactStatLine(stats?: PlayerBattingLine | null): string {
  if (!stats) return 'GP 0 · H 0 · AB 0 · .000';
  return `GP ${stats.gamesPlayed} · H ${stats.hits} · AB ${stats.atBats} · ${stats.average}`;
}

function compactExtraLine(stats?: PlayerBattingLine | null): string {
  if (!stats) return '1B 0 · 2B 0 · 3B 0 · HR 0 · K 0 · Out 0';
  return `1B ${stats.singles ?? 0} · 2B ${stats.doubles ?? 0} · 3B ${stats.triples ?? 0} · HR ${stats.homers ?? 0} · K ${stats.strikeouts ?? 0} · Out ${stats.outs ?? 0}`;
}

function formatLineupLock(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function PlayLogPad({
  game,
  busy,
  onRun,
}: {
  game: Game;
  busy: boolean;
  onRun: (action: () => Promise<Game>) => void;
}) {
  const box = game.box;
  const lineup = box ? battingLineup(game, box) : undefined;
  const batter = lineup?.atBat;
  const canTap = Boolean(batter);
  return (
    <div className="play-log-pad">
      <p className="play-log-heading">
        {batter ? `What did ${playerLabel(batter)} do?` : 'Set the batting lineup to start the game log.'}
      </p>
      <div className="play-buttons" role="group" aria-label="Record a play">
        {PLAY_BUTTONS.map((button) => (
          <button
            key={button.result}
            type="button"
            className={`play-btn play-${button.result}`}
            disabled={busy || !canTap}
            aria-label={`Record ${button.label}`}
            onClick={() => onRun(() => api.recordPlay(game.id, button.result))}
          >
            {button.label}
          </button>
        ))}
      </div>
      <PlayByPlayList plays={game.plays ?? []} />
      <button
        type="button"
        className="play-undo"
        disabled={busy || (game.plays?.length ?? 0) === 0}
        aria-label="Undo last play"
        onClick={() => onRun(() => api.undoLastPlay(game.id))}
      >
        Undo last play
      </button>
    </div>
  );
}

function PlayByPlayList({ plays }: { plays: GamePlay[] }) {
  if (plays.length === 0) {
    return <p className="play-log-empty">No plays yet. Tap a result to add it to the log.</p>;
  }
  const newestFirst = [...plays].reverse();
  return (
    <ol className="play-log" aria-label="Play by play">
      {newestFirst.map((play, index) => (
        <li key={play.id} className="play-log-row">
          <span className="play-log-index">{plays.length - index}</span>
          <span className="play-log-when">{playHalfLabel(play) || '—'}</span>
          <span className="play-log-who">{play.name}</span>
          <span className={`play-log-result is-${play.result}`}>{playLabel(play.result)}</span>
        </li>
      ))}
    </ol>
  );
}

function GameLineups({
  game,
  onChanged,
  onMessage,
  onError,
}: {
  game: Game;
  onChanged: (game: Game) => void;
  onMessage: (text: string | null) => void;
  onError: (text: string | null) => void;
}) {
  const away = game.lineups?.away;
  const home = game.lineups?.home;
  if (!away && !home) return null;
  return (
    <div className="lineup-pair">
      {away && (
        <LineupEditor
          gameId={game.id}
          teamName={game.awayTeamName}
          lineup={away}
          onChanged={onChanged}
          onMessage={onMessage}
          onError={onError}
        />
      )}
      {home && (
        <LineupEditor
          gameId={game.id}
          teamName={game.homeTeamName}
          lineup={home}
          onChanged={onChanged}
          onMessage={onMessage}
          onError={onError}
        />
      )}
    </div>
  );
}

function LineupEditor({
  gameId,
  teamName,
  lineup,
  onChanged,
  onMessage,
  onError,
}: {
  gameId: string;
  teamName: string;
  lineup: GameLineup;
  onChanged: (game: Game) => void;
  onMessage: (text: string | null) => void;
  onError: (text: string | null) => void;
}) {
  const [order, setOrder] = useState<string[]>(() => lineup.slots.map((p) => p.id));
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(lineup.slots.map((p) => [p.id, p])), [lineup.slots]);

  useEffect(() => {
    setOrder(lineup.slots.map((p) => p.id));
  }, [lineup.teamId, lineup.saved, lineup.slots.map((p) => p.id).join('|')]);

  const lockLabel = formatLineupLock(lineup.locksAt);
  const lockPassed = Boolean(lineup.locksAt && Date.parse(lineup.locksAt) <= Date.now());

  async function save() {
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      onChanged(await api.saveLineup(gameId, lineup.teamId, order));
      onMessage(`Saved ${teamName} lineup.`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function move(id: string, dir: -1 | 1) {
    setOrder((current) => {
      const index = current.indexOf(id);
      const nextIndex = index + dir;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [slot] = next.splice(index, 1);
      next.splice(nextIndex, 0, slot);
      return next;
    });
  }

  return (
    <section className="lineup-card" aria-label={`${teamName} lineup`}>
      <h3 className="lineup-heading">{teamName} lineup</h3>
      {lineup.canEdit ? (
        <p className="lineup-note">
          {lockLabel ? `You can change this until ${lockLabel}.` : 'Set the batting order before the game.'}
        </p>
      ) : lockPassed ? (
        <p className="lineup-note">{lockLabel ? `Lineup locked since ${lockLabel}.` : 'Lineup is locked for this game.'}</p>
      ) : (
        <p className="lineup-note">Only this team's manager can set the batting order, until 24 hours before first pitch.</p>
      )}
      <ol className="lineup-list">
        {order.map((id, index) => {
          const player = byId.get(id);
          if (!player) return null;
          return (
            <li key={id} className="lineup-row">
              <span className="lineup-spot">{index + 1}</span>
              <span className="lineup-player">
                <span className="lineup-name">{playerLabel(player)}</span>
                <span className="lineup-stats">{compactStatLine(player.stats)}</span>
                <span className="lineup-extras">{compactExtraLine(player.stats)}</span>
              </span>
              {lineup.canEdit && (
                <span className="lineup-moves">
                  <button type="button" className="score-step tiny" disabled={busy || index === 0} aria-label={`Move ${player.name} up`} onClick={() => move(id, -1)}>
                    ↑
                  </button>
                  <button type="button" className="score-step tiny" disabled={busy || index === order.length - 1} aria-label={`Move ${player.name} down`} onClick={() => move(id, 1)}>
                    ↓
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {lineup.canEdit && (
        <button type="button" className="lineup-save" disabled={busy || order.length === 0} onClick={() => void save()}>
          {busy ? 'Saving…' : `Save ${teamName} lineup`}
        </button>
      )}
    </section>
  );
}

function inningHasStarted(side: ScoreSide, inning: number, currentInning: number, currentHalf: InningHalf): boolean {
  if (inning < currentInning) return true;
  if (inning > currentInning) return false;
  return side === 'away' || currentHalf === 'bottom';
}

function LineCell({
  value,
  blank,
  canScore,
  busy,
  decreaseLabel,
  increaseLabel,
  onMinus,
  onPlus,
}: {
  value: number;
  blank?: boolean;
  canScore: boolean;
  busy: boolean;
  decreaseLabel: string;
  increaseLabel: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const shown = blank && value === 0 ? '–' : value;
  if (!canScore) {
    return <span className={`scoreboard-value ${blank ? 'is-blank' : ''}`}>{shown}</span>;
  }
  return (
    <span className="scoreboard-cell">
      <button
        type="button"
        className="score-step tiny"
        disabled={busy || value === 0}
        aria-label={decreaseLabel}
        onClick={onMinus}
      >
        −
      </button>
      <span className="scoreboard-value">{shown === '–' ? 0 : shown}</span>
      <button
        type="button"
        className="score-step tiny"
        disabled={busy}
        aria-label={increaseLabel}
        onClick={onPlus}
      >
        +
      </button>
    </span>
  );
}

function LineScoreRow({
  side,
  name,
  line,
  runs,
  hits,
  innings,
  currentInning,
  currentHalf,
  canScore,
  busy,
  gameId,
  onRun,
}: {
  side: ScoreSide;
  name: string;
  line: number[];
  runs: number;
  hits: number;
  innings: number;
  currentInning: number;
  currentHalf: InningHalf;
  canScore: boolean;
  busy: boolean;
  gameId: string;
  onRun: (action: () => Promise<Game>) => void;
}) {
  const batting = (currentHalf === 'top' && side === 'away') || (currentHalf === 'bottom' && side === 'home');
  return (
    <tr className={batting ? 'is-batting' : undefined}>
      <th className="line-team-col" scope="row" title={name}>
        {teamAbbr(name)}
      </th>
      {Array.from({ length: innings }, (_, i) => {
        const inning = i + 1;
        const value = line[i] ?? 0;
        const started = inningHasStarted(side, inning, currentInning, currentHalf);
        const current = batting && inning === currentInning;
        return (
          <td key={inning} className={`line-cell ${current ? 'is-current' : ''} ${started ? '' : 'is-future'}`}>
            <span className={`scoreboard-value ${started ? '' : 'is-blank'}`}>{started || value > 0 ? value : '–'}</span>
          </td>
        );
      })}
      <td className="line-tot line-tot-r">
        <LineCell
          value={runs}
          canScore={canScore}
          busy={busy}
          decreaseLabel={`Decrease ${name} R`}
          increaseLabel={`Increase ${name} R`}
          onMinus={() => onRun(() => api.bumpInningRun(gameId, side, currentInning, -1))}
          onPlus={() => onRun(() => api.bumpInningRun(gameId, side, currentInning, 1))}
        />
      </td>
      <td className="line-tot line-tot-h">
        <LineCell
          value={hits}
          canScore={canScore}
          busy={busy}
          decreaseLabel={`Decrease ${name} H`}
          increaseLabel={`Increase ${name} H`}
          onMinus={() => onRun(() => api.bumpScoreStat(gameId, side, 'hits', -1))}
          onPlus={() => onRun(() => api.bumpScoreStat(gameId, side, 'hits', 1))}
        />
      </td>
    </tr>
  );
}

function LineScore({
  gameId,
  awayName,
  homeName,
  box,
  canScore,
  busy,
  onRun,
}: {
  gameId: string;
  awayName: string;
  homeName: string;
  box: GameBoxScore;
  canScore: boolean;
  busy: boolean;
  onRun: (action: () => Promise<Game>) => void;
}) {
  const awayLine = lineFor(box, 'away');
  const homeLine = lineFor(box, 'home');
  const innings = Math.max(awayLine.length, homeLine.length, 7);
  const currentInning = box.currentInning ?? 1;
  const currentHalf = box.currentHalf ?? 'top';
  return (
    <div className={`line-score ${innings > 7 ? 'has-extras' : ''}`} aria-label="Line score">
      <div className="line-score-scroll">
        <table className={`line-score-table ${innings > 7 ? 'is-extras' : ''} ${canScore ? 'is-scoring' : ''}`}>
          <colgroup>
            <col className="line-col-team" />
            {Array.from({ length: innings }, (_, i) => (
              <col key={i} className="line-col-inning" />
            ))}
            <col className="line-col-tot" />
            <col className="line-col-tot" />
          </colgroup>
          <thead>
            <tr>
              <th className="line-team-col" scope="col">
                <span className="visually-hidden">Team</span>
              </th>
              {Array.from({ length: innings }, (_, i) => (
                <th
                  key={i + 1}
                  scope="col"
                  className={currentInning === i + 1 ? 'is-current' : undefined}
                >
                  {i + 1}
                </th>
              ))}
              <th className="line-tot line-tot-r" scope="col">
                R
              </th>
              <th className="line-tot line-tot-h" scope="col">
                H
              </th>
            </tr>
          </thead>
          <tbody>
            <LineScoreRow
              side="away"
              name={awayName}
              line={awayLine}
              runs={box.awayRuns}
              hits={box.awayHits}
              innings={innings}
              currentInning={currentInning}
              currentHalf={currentHalf}
              canScore={canScore}
              busy={busy}
              gameId={gameId}
              onRun={onRun}
            />
            <LineScoreRow
              side="home"
              name={homeName}
              line={homeLine}
              runs={box.homeRuns}
              hits={box.homeHits}
              innings={innings}
              currentInning={currentInning}
              currentHalf={currentHalf}
              canScore={canScore}
              busy={busy}
              gameId={gameId}
              onRun={onRun}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function lineupBadge(row: TeamBoardRow, fullLineupSize: number) {
  const full = row.lineupStatus === 'full_lineup';
  return (
    <span className={`lineup-badge${full ? ' is-full' : ' is-need'}`}>
      {full ? 'Full lineup' : 'Need guys'}
      <span className="lineup-count">
        {row.checkedInCount}/{fullLineupSize} in
      </span>
      <span className="lineup-count">
        {row.rosterFilled}/{TEAM_ROSTER_SPOTS} roster
      </span>
    </span>
  );
}

function TeamsBoard({
  onOpenTeam,
  onOpenPlayer,
  onSignUp,
}: {
  onOpenTeam: (teamId: string) => void;
  onOpenPlayer: (playerId: string) => void;
  onSignUp: () => void;
}) {
  const { user, refresh } = useAuth();
  const [board, setBoard] = useState<TeamBoard | null>(null);
  const [invites, setInvites] = useState<FaInvite[]>([]);
  const [joinPick, setJoinPick] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadBoard = useCallback(() => {
    api.getTeamBoard().then((next) => {
      setBoard(next);
      setJoinPick((prev) => prev || user?.teamId || next.teams[0]?.id || '');
    });
    if (user) {
      api.listFaInvites().then(setInvites).catch(() => setInvites([]));
    } else {
      setInvites([]);
    }
  }, [user?.teamId, user]);

  useEffect(() => {
    loadBoard();
    const timer = window.setInterval(loadBoard, 8000);
    return () => window.clearInterval(timer);
  }, [loadBoard]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinPick) return;
    setMessage(null);
    setBusy(true);
    try {
      await api.joinTeam(joinPick);
      await refresh();
      loadBoard();
      setMessage('Joined the team.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    setMessage(null);
    setBusy(true);
    try {
      await api.joinTeam(null);
      await refresh();
      loadBoard();
      setMessage('You are a free agent.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleInvite(agentId: string) {
    setMessage(null);
    setBusy(true);
    try {
      await api.inviteFreeAgent(agentId);
      loadBoard();
      setMessage('Invite sent.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleInviteRespond(id: string, accept: boolean) {
    setMessage(null);
    setBusy(true);
    try {
      await api.respondFaInvite(id, accept);
      await refresh();
      loadBoard();
      setMessage(accept ? 'You joined the team.' : 'Invite declined.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const playerTeam = board?.teams.find((t) => t.id === user?.teamId) ?? null;
  const canUseFreeAgency = Boolean(board?.freeAgencyOpen && user?.role === 'player');
  const incoming = invites.filter((inv) => inv.status === 'pending' && inv.toUserId === user?.id);
  const canInvite = user?.role === 'manager' && Boolean(user.teamId);

  return (
    <section className="card">
      <h2>Teams</h2>
      <p className="muted-copy">
        Live lineup for this week. Click a team to see who&apos;s checked in.
      </p>

      <div className="free-agency">
        <h3>Free agency</h3>
        {board && !board.freeAgencyOpen ? (
          <p className="muted-copy">Free agency closed — playoffs have started. Managers can still invite a guy for a game.</p>
        ) : (
          <>
            <p className="muted-copy">
              Sign up as a free agent and join a team until the regular season ends.
            </p>
            {!user && (
              <button type="button" className="primary-btn" onClick={onSignUp}>
                Sign up as a free agent
              </button>
            )}
            {user && canUseFreeAgency && !user.teamId && board && (
              <form className="add-row" onSubmit={handleJoin}>
                <label className="field inline">
                  Join a team:{' '}
                  <select
                    aria-label="Join a team"
                    value={joinPick}
                    onChange={(e) => setJoinPick(e.target.value)}
                  >
                    {board.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" disabled={busy || !joinPick}>
                  Join
                </button>
              </form>
            )}
            {user && canUseFreeAgency && user.teamId && playerTeam && (
              <div className="join-bar">
                <p className="join-status">You&apos;re on {playerTeam.name}</p>
                <button type="button" className="link-btn danger" onClick={handleLeave} disabled={busy}>
                  Leave and become a free agent
                </button>
              </div>
            )}
          </>
        )}
            {incoming.length > 0 && (
              <ul className="invite-list">
                {incoming.map((inv) => (
                  <li key={inv.id} className="invite-row">
                    <span>
                      {inv.teamName} wants you this week
                      {inv.time || inv.field ? ` · ${[inv.field, inv.time].filter(Boolean).join(' · ')}` : ''}
                    </span>
                    <span className="invite-actions">
                      <button type="button" disabled={busy} onClick={() => handleInviteRespond(inv.id, true)}>
                        Accept
                      </button>
                      <button type="button" className="link-btn" disabled={busy} onClick={() => handleInviteRespond(inv.id, false)}>
                        Decline
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {board && board.freeAgents.length === 0 ? (
              <p className="member-empty">No free agents right now.</p>
            ) : (
              <ul className="free-agent-cards">
                {(board?.freeAgents ?? []).map((agent) => (
                  <li key={agent.id} className="fa-card">
                    <button type="button" className="fa-card-main" onClick={() => onOpenPlayer(agent.id)}>
                      {agent.photoUrl ? (
                        <img className="avatar member-avatar" src={agent.photoUrl} alt="" />
                      ) : (
                        <span className="avatar avatar-initials member-avatar">{initials(agent.name)}</span>
                      )}
                      <span className="member-info">
                        <span className="member-name">{agent.name}</span>
                        <span className="member-meta">
                          {[agent.number != null ? `#${agent.number}` : null, agent.position, skillLabel(agent.skillLevel)]
                            .filter(Boolean)
                            .join(' · ') || 'Free agent'}
                        </span>
                      </span>
                    </button>
                    {canInvite && (
                      <button
                        type="button"
                        className="link-btn"
                        disabled={busy || agent.invitedByMe}
                        onClick={() => handleInvite(agent.id)}
                      >
                        {agent.invitedByMe ? 'Invited' : 'Invite for this week'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
        {message && <p className="message">{message}</p>}
      </div>

      {!board ? (
        <p className="muted-copy">Loading teams…</p>
      ) : (
        <ul className="team-board-list">
          {board.teams.map((team) => (
            <li key={team.id}>
              <button
                type="button"
                className="team-board-row"
                onClick={() => onOpenTeam(team.id)}
                aria-label={`Open ${team.name}`}
              >
                {team.photoUrl ? (
                  <img className="team-logo" src={team.photoUrl} alt="" />
                ) : (
                  <span className="team-logo team-logo-placeholder" aria-hidden="true">
                    {initials(team.name)}
                  </span>
                )}
                <span className="team-board-info">
                  <span className="team-board-name">{team.name}</span>
                  {team.weekGame && (
                    <span className="team-board-game">
                      {team.weekGame.home ? 'vs' : 'at'} {team.weekGame.opponentName}
                      {' · '}
                      {team.weekGame.field || 'Field TBD'}
                      {' · '}
                      {team.weekGame.time || 'Time TBD'}
                    </span>
                  )}
                  {(() => {
                    const mgrs = teamManagersOf(team);
                    const spots = board.managerSpots ?? MANAGERS_PER_TEAM;
                    const names = mgrs.map((m) => m.name).join(' · ');
                    return (
                      <span className="team-board-mgr">
                        Managers · {mgrs.length}/{spots}
                        {names ? ` · ${names}` : ' · open spot to keep score'}
                      </span>
                    );
                  })()}
                  <span className="team-board-roster">
                    {team.rosterFilled}/{board.rosterSpots ?? TEAM_ROSTER_SPOTS} spots
                  </span>
                </span>
                {lineupBadge(team, board.fullLineupSize)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PlayerProfilePage({
  playerId,
  onBack,
  onOpenTeam,
}: {
  playerId: string;
  onBack: () => void;
  onOpenTeam: (teamId: string) => void;
}) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .getPlayer(playerId)
      .then((next) => {
        setProfile(next);
        setError(null);
      })
      .catch((err) => setError((err as Error).message));
  }, [playerId]);

  useEffect(() => {
    load();
  }, [load]);

  async function review(status: 'approved' | 'rejected') {
    setBusy(true);
    setMessage(null);
    try {
      setProfile(await api.reviewWaiver(playerId, status));
      setMessage(status === 'approved' ? 'Waiver approved.' : 'Waiver sent back.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function invite() {
    setBusy(true);
    setMessage(null);
    try {
      await api.inviteFreeAgent(playerId);
      setMessage('Invite sent for this week.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <section className="card">
        <button type="button" className="link-btn back-link" onClick={onBack}>
          ← Teams
        </button>
        <p className="error">{error}</p>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="card">
        <p className="muted-copy">Loading player…</p>
      </section>
    );
  }

  const canInvite = Boolean(user?.role === 'manager' && user.teamId && !profile.teamId);
  const stats = profile.stats;

  return (
    <section className="card player-profile">
      <button type="button" className="link-btn back-link" onClick={onBack}>
        ← Teams
      </button>
      <div className="player-hero">
        {profile.photoUrl ? (
          <img className="player-hero-photo" src={profile.photoUrl} alt="" />
        ) : (
          <span className="player-hero-photo player-hero-fallback">{initials(profile.name)}</span>
        )}
        <div className="player-hero-text">
          <p className="player-hero-number">{profile.number != null ? `#${profile.number}` : 'FA'}</p>
          <h2>{profile.name}</h2>
          <p className="player-hero-meta">
            {[profile.position, skillLabel(profile.skillLevel), profile.isManager ? 'Manager' : null]
              .filter(Boolean)
              .join(' · ') || 'Player'}
          </p>
          {profile.teamName && profile.teamId ? (
            <button type="button" className="link-btn" onClick={() => onOpenTeam(profile.teamId!)}>
              {profile.teamName}
            </button>
          ) : (
            <p className="muted-copy">Free agent</p>
          )}
        </div>
      </div>

      <dl className="stat-line">
        <div>
          <dt title="Games Played">GP</dt>
          <dd>{stats.gamesPlayed}</dd>
        </div>
        <div>
          <dt title="Hits">Hits</dt>
          <dd>{stats.hits}</dd>
        </div>
        <div>
          <dt title="At Bats">AB</dt>
          <dd>{stats.atBats}</dd>
        </div>
        <div>
          <dt title="Average">AVG</dt>
          <dd>{stats.average}</dd>
        </div>
      </dl>
      <dl className="stat-line stat-line-extra" aria-label="Extra-base and out counts">
        <div>
          <dt title="Singles">1B</dt>
          <dd>{stats.singles ?? 0}</dd>
        </div>
        <div>
          <dt title="Doubles">2B</dt>
          <dd>{stats.doubles ?? 0}</dd>
        </div>
        <div>
          <dt title="Triples">3B</dt>
          <dd>{stats.triples ?? 0}</dd>
        </div>
        <div>
          <dt title="Home runs">HR</dt>
          <dd>{stats.homers ?? 0}</dd>
        </div>
        <div>
          <dt title="Strikeouts">K</dt>
          <dd>{stats.strikeouts ?? 0}</dd>
        </div>
        <div>
          <dt title="Outs">Out</dt>
          <dd>{stats.outs ?? 0}</dd>
        </div>
      </dl>

      <div className={`waiver-panel is-${profile.waiverStatus}`}>
        <h3>Waiver</h3>
        <p>{waiverLabel(profile.waiverStatus)}</p>
        {profile.waiverUrl && (profile.canReviewWaiver || user?.id === profile.id) && (
          <a className="link-btn" href={profile.waiverUrl} target="_blank" rel="noreferrer">
            View uploaded waiver
          </a>
        )}
        {profile.canReviewWaiver && profile.waiverStatus === 'pending' && (
          <div className="add-row">
            <button type="button" disabled={busy} onClick={() => review('approved')}>
              Approve
            </button>
            <button type="button" className="link-btn danger" disabled={busy} onClick={() => review('rejected')}>
              Send back
            </button>
          </div>
        )}
      </div>

      <div className="phone-panel">
        <h3>Contact</h3>
        {profile.canSeePhone && profile.phone ? (
          <p>
            <a href={`tel:${profile.phone}`}>{profile.phone}</a>
          </p>
        ) : user?.id === profile.id ? (
          <p className="muted-copy">
            {profile.sharePhone
              ? 'Managers can see the number in your profile.'
              : 'Turn on “Let managers see my number” in your profile if you want a call about a game.'}
          </p>
        ) : (
          <p className="muted-copy">Phone is hidden unless this player shares it with managers.</p>
        )}
      </div>

      {canInvite && (
        <button type="button" className="primary-btn" disabled={busy} onClick={invite}>
          Invite for this week
        </button>
      )}
      {message && <p className="message">{message}</p>}
    </section>
  );
}

function TeamPage({
  teamId,
  onBack,
  onOpenPlayer,
}: {
  teamId: string;
  onBack: () => void;
  onOpenPlayer: (playerId: string) => void;
}) {
  const { user, refresh } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<Player[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [currentWeek, setCurrentWeek] = useState<CurrentWeek | null>(null);
  const [freeAgencyOpen, setFreeAgencyOpen] = useState(true);
  const [managers, setManagers] = useState<TeamManagerSummary[]>([]);
  const [managerSpots, setManagerSpots] = useState(MANAGERS_PER_TEAM);
  const [checkingIn, setCheckingIn] = useState(false);
  const [accounts, setAccounts] = useState<PlayerAccount[]>([]);
  const [pickMember, setPickMember] = useState('');
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [position, setPosition] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [teamNameDraft, setTeamNameDraft] = useState('');
  const [teamPhotoPreview, setTeamPhotoPreview] = useState<string | null>(null);

  const canEdit = canManageTeam(user, teamId);
  const canManage = user?.role === 'admin' || (user?.role === 'manager' && user.teamId === teamId);

  const loadRoster = useCallback(() => {
    if (!teamId) return;
    api.getRoster(teamId).then((r) => {
      setTeam(r.team);
      setRoster(r.roster);
      setMembers(r.members ?? []);
      setCurrentWeek(r.currentWeek ?? null);
      setFreeAgencyOpen(r.freeAgencyOpen !== false);
      setManagers(teamManagersOf(r));
      setManagerSpots(r.managerSpots ?? MANAGERS_PER_TEAM);
    });
  }, [teamId]);

  useEffect(() => {
    loadRoster();
    const timer = window.setInterval(loadRoster, 8000);
    return () => window.clearInterval(timer);
  }, [loadRoster]);

  useEffect(() => {
    if (!canManage) return;
    api.listMembers().then(setAccounts).catch(() => setAccounts([]));
  }, [canManage, teamId]);

  useEffect(() => {
    setTeamNameDraft(team?.name ?? '');
    setTeamPhotoPreview(team?.photoUrl ?? null);
  }, [team?.id, team?.name, team?.photoUrl]);

  const addableAccounts =
    user?.role === 'admin'
      ? accounts.filter((a) => a.teamId !== teamId)
      : accounts.filter((a) => a.teamId == null);
  const pickValue = addableAccounts.some((a) => a.id === pickMember)
    ? pickMember
    : addableAccounts[0]?.id ?? '';

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      const updated = await api.renameTeam(teamId, teamNameDraft);
      setTeam(updated);
      setMessage(`Renamed to ${updated.name}.`);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleTeamPhoto(file: File) {
    setMessage(null);
    try {
      const dataUrl = await fileToSquareDataUrl(file);
      setTeamPhotoPreview(dataUrl);
      const updated = await api.setTeamPhoto(teamId, dataUrl);
      setTeam(updated);
      setMessage('Team photo saved.');
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await api.addPlayer({ teamId, name, number: Number(number), position });
      loadRoster();
      setName('');
      setNumber('');
      setPosition('');
      setMessage('Player added!');
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleRemove(playerId: string) {
    setMessage(null);
    try {
      await api.removePlayer(playerId);
      loadRoster();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleJoin() {
    setMessage(null);
    try {
      await api.joinTeam(teamId);
      await refresh();
      loadRoster();
      setMessage('Joined the team.');
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleLeave() {
    setMessage(null);
    try {
      await api.joinTeam(null);
      await refresh();
      loadRoster();
      setMessage('You left the team.');
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!pickValue) return;
    setMessage(null);
    try {
      await api.setUserTeam(pickValue, teamId);
      loadRoster();
      const next = await api.listMembers();
      setAccounts(next);
      setMessage('Player added to the team.');
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleRemoveMember(memberId: string) {
    setMessage(null);
    try {
      await api.setUserTeam(memberId, null);
      loadRoster();
      const next = await api.listMembers();
      setAccounts(next);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleCheckIn(status: 'in' | 'out') {
    if (!currentWeek) return;
    const mine = members.find((m) => m.id === user?.id)?.checkIn ?? null;
    const next = mine === status ? null : status;
    setMessage(null);
    setCheckingIn(true);
    try {
      await api.checkIn(currentWeek.week, next);
      loadRoster();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setCheckingIn(false);
    }
  }

  const playsOnTeam = Boolean(
    user?.teamId && (user.role === 'player' || (user.role === 'manager' && user.onRoster !== false)),
  );
  const canCheckIn = Boolean(playsOnTeam && user && user.teamId === teamId && currentWeek);
  const myCheckIn = members.find((m) => m.id === user?.id)?.checkIn ?? null;
  const checkInCounts = {
    in: members.filter((m) => m.checkIn === 'in').length,
    out: members.filter((m) => m.checkIn === 'out').length,
    none: members.filter((m) => m.checkIn !== 'in' && m.checkIn !== 'out').length,
  };
  const playerCanJoin = Boolean(freeAgencyOpen && user?.role === 'player' && !user.teamId);
  const playerCanLeave = Boolean(freeAgencyOpen && user?.role === 'player' && user.teamId === teamId);
  const showAddRegistered = canEdit && (user?.role === 'admin' || freeAgencyOpen);

  return (
    <section className="card">
      <button type="button" className="link-btn back-link" onClick={onBack}>
        ← Teams
      </button>
      <h2>{team?.name ?? 'Team'}</h2>

      {playerCanJoin && (
        <div className="join-bar">
          <button type="button" className="primary-btn" onClick={handleJoin}>
            Join this team
          </button>
        </div>
      )}
      {playerCanLeave && (
        <div className="join-bar">
          <p className="join-status">You&apos;re on this team</p>
          <button type="button" className="link-btn danger" onClick={handleLeave}>
            Leave
          </button>
        </div>
      )}

      {team && (
        <div className="roster-team-header">
          {team.photoUrl ? (
            <img className="team-logo" src={team.photoUrl} alt="" />
          ) : (
            <span className="team-logo team-logo-placeholder" aria-hidden="true">
              {initials(team.name)}
            </span>
          )}
          <div>
            <h3 className="roster-team-name">{team.name}</h3>
            <p className="roster-manager">
              Managers · {managers.length}/{managerSpots}
              {managers.length > 0
                ? ` · ${managers.map((m) => (m.onRoster === false ? `${m.name} (score only)` : m.name)).join(' · ')}`
                : ' · open spots so someone can keep score'}
            </p>
          </div>
        </div>
      )}

      {currentWeek && (
        <div className="checkin-panel">
          <h3 className="checkin-heading">
            Check-in — Week {currentWeek.week} · {formatGameDate(currentWeek.date)}
          </h3>
          {members.length > 0 && (
            <p className="checkin-summary">
              {IN_MARK} {checkInCounts.in} · {OUT_MARK} {checkInCounts.out} · — {checkInCounts.none}
            </p>
          )}
          {canCheckIn && (
            <div className="checkin-actions">
              <button
                type="button"
                className={`checkin-btn${myCheckIn === 'in' ? ' active-in' : ''}`}
                aria-pressed={myCheckIn === 'in'}
                aria-label="I'm there"
                disabled={checkingIn}
                onClick={() => handleCheckIn('in')}
              >
                <span className="checkin-emoji" aria-hidden="true">
                  {IN_MARK}
                </span>
                I&apos;m there
              </button>
              <button
                type="button"
                className={`checkin-btn${myCheckIn === 'out' ? ' active-out' : ''}`}
                aria-pressed={myCheckIn === 'out'}
                aria-label="Can't make it"
                disabled={checkingIn}
                onClick={() => handleCheckIn('out')}
              >
                <span className="checkin-emoji" aria-hidden="true">
                  {OUT_MARK}
                </span>
                Can&apos;t make it
              </button>
            </div>
          )}
        </div>
      )}

      {canEdit && (
        <div className="team-manage">
          <form className="add-row team-rename-row" onSubmit={handleRename}>
            <input
              aria-label="Team name"
              value={teamNameDraft}
              onChange={(e) => setTeamNameDraft(e.target.value)}
              required
            />
            <button type="submit">Save name</button>
          </form>
          <PhotoPicker
            id="team-photo"
            label="Team photo"
            value={teamPhotoPreview ?? team?.photoUrl}
            onFile={handleTeamPhoto}
          />
        </div>
      )}

      {message && <p className="message">{message}</p>}

      <h3 className="roster-heading">
        Managers · {managers.length}/{managerSpots}
      </h3>
      <ul className="member-list roster-spots">
        {managers.map((m, index) => (
          <li key={`mgr-${m.name}-${index}`} className="member-row">
            <span className="avatar avatar-initials member-avatar" aria-hidden="true">
              {initials(m.name)}
            </span>
            <div className="member-info">
              <span className="member-name">
                <span>{m.name}</span>
                <span className="manager-badge">Manager</span>
              </span>
              <span className="member-meta">
                {m.onRoster === false ? 'Keeps score · does not play' : 'Keeps score · on the roster'}
              </span>
            </div>
          </li>
        ))}
        {Array.from({ length: Math.max(0, managerSpots - managers.length) }, (_, i) => (
          <li key={`mgr-open-${i}`} className="member-row is-open">
            <span className="avatar member-avatar roster-spot-num" aria-hidden="true">
              {managers.length + i + 1}
            </span>
            <div className="member-info">
              <span className="member-name">Open manager spot</span>
              <span className="member-meta">Can keep score if the other manager is out</span>
            </div>
          </li>
        ))}
      </ul>

      <h3 className="roster-heading">
        Roster · {members.length + roster.length}/{TEAM_ROSTER_SPOTS}
      </h3>
      <ul className="member-list roster-spots">
        {members.map((m) => (
          <li key={m.id} className="member-row">
            <button type="button" className="member-open" onClick={() => onOpenPlayer(m.id)}>
            {m.photoUrl ? (
              <img className="avatar member-avatar" src={m.photoUrl} alt="" />
            ) : (
              <span className="avatar avatar-initials member-avatar" aria-hidden="true">
                {initials(m.name)}
              </span>
            )}
            <div className="member-info">
              <span className="member-name">
                <span>{m.name}</span>
                {m.isManager ? <span className="manager-badge">Manager</span> : null}
              </span>
              <span className="member-meta">
                {[m.number != null ? `#${m.number}` : null, m.position, skillLabel(m.skillLevel)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            </button>
            {canEdit && (
              <span className={`waiver-chip is-${m.waiverStatus ?? 'none'}`}>{waiverLabel(m.waiverStatus)}</span>
            )}
            {currentWeek && (
              <span
                className={`checkin-marker${m.checkIn ? ` is-${m.checkIn}` : ' is-none'}`}
                title={
                  m.checkIn === 'in'
                    ? `${m.name} is in`
                    : m.checkIn === 'out'
                      ? `${m.name} can't make it`
                      : `${m.name} hasn't checked in`
                }
                aria-label={
                  m.checkIn === 'in'
                    ? `${m.name} is in`
                    : m.checkIn === 'out'
                      ? `${m.name} can't make it`
                      : `${m.name} hasn't checked in`
                }
              >
                {checkInMark(m.checkIn)}
              </span>
            )}
            {canEdit && !m.isManager && (
              <button
                className="link-btn danger"
                onClick={() => handleRemoveMember(m.id)}
                aria-label={`Remove ${m.name} from team`}
              >
                Remove from team
              </button>
            )}
          </li>
        ))}
        {roster.map((p) => (
          <li key={p.id} className="member-row is-unregistered">
            <span className="avatar avatar-initials member-avatar" aria-hidden="true">
              {initials(p.name)}
            </span>
            <div className="member-info">
              <span className="member-name">{p.name}</span>
              <span className="member-meta">
                {[`#${p.number}`, p.position, 'Unregistered'].filter(Boolean).join(' · ')}
              </span>
            </div>
            {canEdit && (
              <button className="link-btn danger" onClick={() => handleRemove(p.id)} aria-label={`Remove ${p.name}`}>
                Remove
              </button>
            )}
          </li>
        ))}
        {Array.from({ length: Math.max(0, TEAM_ROSTER_SPOTS - members.length - roster.length) }, (_, i) => {
          const spot = members.length + roster.length + i + 1;
          return (
            <li key={`open-${spot}`} className="member-row is-open">
              <span className="avatar member-avatar roster-spot-num" aria-hidden="true">
                {spot}
              </span>
              <div className="member-info">
                <span className="member-name">Open spot</span>
                <span className="member-meta">
                  Spot {spot} of {TEAM_ROSTER_SPOTS}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {showAddRegistered && (
        <form className="add-form" onSubmit={handleAddMember}>
          <h3>{user?.role === 'admin' ? 'Add a registered player' : 'Pick up a free agent'}</h3>
          {addableAccounts.length === 0 ? (
            <p className="member-empty">
              {user?.role === 'admin'
                ? 'Every registered player is already on this team.'
                : 'No free agents available.'}
            </p>
          ) : (
            <div className="add-row">
              <select
                aria-label="Registered player"
                value={pickValue}
                onChange={(e) => setPickMember(e.target.value)}
              >
                {addableAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <button type="submit">Add to team</button>
            </div>
          )}
        </form>
      )}
      {canEdit && !freeAgencyOpen && user?.role === 'manager' && (
        <p className="muted-copy">Free agency closed — playoffs have started.</p>
      )}

      {canEdit ? (
        <form className="add-form" onSubmit={handleAdd}>
          <h3>Add a player</h3>
          <div className="add-row">
            <input aria-label="Player name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <input aria-label="Jersey number" placeholder="#" type="number" value={number} onChange={(e) => setNumber(e.target.value)} />
            <input aria-label="Position" placeholder="Position" value={position} onChange={(e) => setPosition(e.target.value)} />
            <button type="submit">Add</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function Rules() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [rules, setRules] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.getRules().then((r) => setRules(r.rules)).catch((e) => setError(e.message));
  }, []);

  function startEdit() {
    setDraft(rules);
    setMessage(null);
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.updateRules(draft);
      setRules(res.rules);
      setEditing(false);
      setMessage('Rules saved!');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !editing) return <p className="error">{error}</p>;

  return (
    <section className="card">
      <h2>League Rules</h2>
      {editing ? (
        <div className="rules-edit">
          <textarea
            className="rules-textarea"
            aria-label="League rules"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={16}
          />
          {error && <p className="error inline-error">{error}</p>}
          <div className="rules-actions">
            <button className="primary-btn" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="link-btn" onClick={cancelEdit} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {isAdmin && (
            <div className="rules-toolbar">
              <button className="mini-btn" onClick={startEdit}>
                Edit rules
              </button>
            </div>
          )}
          {message && <p className="message">{message}</p>}
          <div className="rules-text">{rules}</div>
        </>
      )}
    </section>
  );
}

function ColorSchemeAdmin({
  onError,
  onMessage,
}: {
  onError: (message: string | null) => void;
  onMessage: (message: string | null) => void;
}) {
  const [theme, setTheme] = useState<Theme | null>(null);
  const [selected, setSelected] = useState<ThemeId>('liberty');
  const [primary, setPrimary] = useState('#1d3557');
  const [accent, setAccent] = useState('#f2a900');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    api
      .getTheme()
      .then((next) => {
        setTheme(next);
        setSelected(next.id);
        setPrimary(next.primary);
        setAccent(next.accent);
        applyTheme(next);
      })
      .catch((e) => onError((e as Error).message));
  }, [onError]);

  async function save(id: ThemeId, nextPrimary = primary, nextAccent = accent) {
    setSaving(true);
    onError(null);
    onMessage(null);
    try {
      const saved = await api.updateTheme(
        id === 'custom' ? { id, primary: nextPrimary, accent: nextAccent } : { id },
      );
      setTheme(saved);
      setSelected(saved.id);
      setPrimary(saved.primary);
      setAccent(saved.accent);
      applyTheme(saved);
      setStatus(`Color scheme saved: ${saved.label}.`);
      onMessage(null);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!theme) return <p className="muted-copy">Loading color scheme…</p>;

  return (
    <div className="theme-panel">
      <h3>Color scheme</h3>
      <p className="theme-help">Everyone in the league sees the scheme you save. Tap a swatch to apply it now.</p>
      {status && <p className="message">{status}</p>}
      <div className="theme-grid">
        {theme.presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`theme-swatch${selected === preset.id ? ' selected' : ''}`}
            disabled={saving}
            aria-pressed={selected === preset.id}
            aria-label={`${preset.label} color scheme`}
            onClick={() => void save(preset.id)}
            style={{
              '--swatch-primary': preset.primary,
              '--swatch-accent': preset.accent,
            } as CSSProperties}
          >
            <span className="theme-swatch-bar" aria-hidden="true" />
            <span className="theme-swatch-label">{preset.label}</span>
            <span className="theme-swatch-blurb">{preset.blurb}</span>
          </button>
        ))}
      </div>
      <div className={`theme-custom${selected === 'custom' ? ' selected' : ''}`}>
        <p className="theme-custom-title">Custom</p>
        <div className="theme-custom-row">
          <label className="theme-color-field">
            Primary
            <input
              type="color"
              value={primary}
              aria-label="Custom primary color"
              onChange={(e) => setPrimary(e.target.value)}
            />
          </label>
          <label className="theme-color-field">
            Accent
            <input
              type="color"
              value={accent}
              aria-label="Custom accent color"
              onChange={(e) => setAccent(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="primary-btn theme-save-btn"
            disabled={saving}
            onClick={() => void save('custom')}
          >
            {saving && selected === 'custom' ? 'Saving…' : 'Save custom'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Admin() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newTeam, setNewTeam] = useState('');
  const [mgrPlayerId, setMgrPlayerId] = useState('');
  const [mgrTeamId, setMgrTeamId] = useState('');
  const [mgrOnRoster, setMgrOnRoster] = useState(true);
  const [authorizations, setAuthorizations] = useState<ManagerAuthorization[]>([]);
  const [authorizing, setAuthorizing] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [testDataConfirm, setTestDataConfirm] = useState<'generate' | 'clear' | null>(null);
  const [testDataBusy, setTestDataBusy] = useState(false);
  const [testDataSummary, setTestDataSummary] = useState<string | null>(null);
  const [mailStatus, setMailStatus] = useState<MailStatus | null>(null);
  const [mailTestBusy, setMailTestBusy] = useState(false);
  const [pendingWaivers, setPendingWaivers] = useState<PublicPlayerProfile[]>([]);
  const [sheetStatus, setSheetStatus] = useState<PlayerStatsSheetStatus | null>(null);
  const [sheetBusy, setSheetBusy] = useState<'sync' | 'preview' | 'csv' | null>(null);

  const teamName = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);
  const managerCountByTeam = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of users) {
      if (u.role !== 'manager' || !u.teamId) continue;
      counts.set(u.teamId, (counts.get(u.teamId) ?? 0) + 1);
    }
    return counts;
  }, [users]);
  const openTeams = useMemo(
    () => teams.filter((t) => (managerCountByTeam.get(t.id) ?? 0) < MANAGERS_PER_TEAM),
    [teams, managerCountByTeam],
  );
  const playerAccounts = useMemo(() => users.filter((u) => u.role === 'player'), [users]);

  useEffect(() => {
    setMgrTeamId((current) => (openTeams.some((t) => t.id === current) ? current : openTeams[0]?.id ?? ''));
  }, [openTeams]);

  useEffect(() => {
    setMgrPlayerId((current) =>
      playerAccounts.some((u) => u.id === current) ? current : playerAccounts[0]?.id ?? '',
    );
  }, [playerAccounts]);

  function load() {
    api.listUsers().then(setUsers).catch((e) => setError(e.message));
    api
      .getTeams()
      .then((next) => {
        setTeams(next);
        setDrafts(Object.fromEntries(next.map((t) => [t.id, t.name])));
      })
      .catch((e) => setError(e.message));
    api.listManagerEmails().then(setAuthorizations).catch((e) => setError(e.message));
    api.listSuggestions().then(setSuggestions).catch((e) => setError(e.message));
    api
      .getMailStatus()
      .then((status) => {
        if (status && typeof status === 'object' && 'configured' in status) setMailStatus(status);
      })
      .catch((e) => setError(e.message));
    api.listPendingWaivers().then(setPendingWaivers).catch((e) => setError(e.message));
    api
      .getPlayerStatsSheetStatus()
      .then((status) => {
        if (status && typeof status === 'object' && 'spreadsheetId' in status) setSheetStatus(status);
      })
      .catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function changeRole(u: User, role: Role, teamId: string | null, onRoster?: boolean) {
    setError(null);
    setMessage(null);
    try {
      await api.setUserRole(u.id, role, teamId, onRoster);
      setMessage(`Updated ${u.name}.`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addTeam(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createTeam(newTeam);
      setNewTeam('');
      setMessage('Team created.');
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function renameTeam(e: React.FormEvent, teamId: string) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const updated = await api.renameTeam(teamId, drafts[teamId] ?? '');
      setMessage(`Renamed to ${updated.name}.`);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function authorizeManagers(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setAuthorizing(true);
    try {
      const player = playerAccounts.find((u) => u.id === mgrPlayerId);
      if (!player) throw new Error('Pick a player to promote');
      const result = await api.authorizeManagers(player.email, mgrTeamId, mgrOnRoster);
      const parts = [`Promoted ${result.promoted.length} player${result.promoted.length === 1 ? '' : 's'} to manager.`];
      if (result.skipped.length) {
        parts.push(
          `Skipped ${result.skipped.length} — they need a player account first.`,
        );
      }
      setMessage(parts.join(' '));
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAuthorizing(false);
    }
  }

  async function revokeAuthorization(email: string) {
    setError(null);
    setMessage(null);
    try {
      await api.revokeManagerEmail(email);
      setMessage(`Removed ${email}.`);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function removeSuggestion(id: string) {
    setError(null);
    setMessage(null);
    try {
      await api.deleteSuggestion(id);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      setMessage('Suggestion removed.');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function formatGenerateSummary(result: TestDataGenerateResult): string {
    if (result.alreadySeeded) {
      return 'Already seeded — guest accounts already exist. Clear test data first to re-seed.';
    }
    return `Created ${result.guestsCreated} guests, ${result.checkIns} check-ins, ${result.messages} messages, ${result.gamesPlayed} games scored`;
  }

  function formatClearSummary(result: TestDataClearResult): string {
    return `Removed ${result.guestsRemoved} guests, reset ${result.gamesReset} games`;
  }

  async function runGenerateTestData() {
    setTestDataBusy(true);
    setError(null);
    setMessage(null);
    setTestDataSummary(null);
    try {
      const result = await api.generateTestData();
      setTestDataSummary(formatGenerateSummary(result));
      setTestDataConfirm(null);
      load();
    } catch (err) {
      const text = (err as Error).message;
      if (/already seeded/i.test(text)) {
        setTestDataSummary('Already seeded — guest accounts already exist. Clear test data first to re-seed.');
        setTestDataConfirm(null);
      } else {
        setError(text);
      }
    } finally {
      setTestDataBusy(false);
    }
  }

  async function sendTestMail() {
    setMailTestBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.sendTestMail();
      setMessage(`Test email sent to ${result.to}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setMailTestBusy(false);
    }
  }

  async function syncPlayerStatsSheet(dryRun: boolean) {
    setSheetBusy(dryRun ? 'preview' : 'sync');
    setError(null);
    setMessage(null);
    try {
      const result = await api.syncPlayerStatsSheet(dryRun);
      setSheetStatus(result);
      if (result.wrote) {
        setMessage(
          `Updated Google Sheet — ${result.playerCount} players across ${result.teamCount} teams` +
            (result.freeAgentCount ? ` plus ${result.freeAgentCount} free agents` : '') +
            '.',
        );
      } else if (!result.configured) {
        setMessage(
          `Preview ready (${result.playerCount} players). Google credentials are not on this host — download the CSV to paste into the sheet.`,
        );
      } else {
        setMessage(`Preview ready — ${result.playerCount} players grouped by team. Nothing written.`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSheetBusy(null);
    }
  }

  async function downloadPlayerStatsCsv() {
    setSheetBusy('csv');
    setError(null);
    setMessage(null);
    try {
      await api.downloadPlayerStatsCsv();
      setMessage('Downloaded oakdale-player-stats.csv — paste it into the Player Stats tab.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSheetBusy(null);
    }
  }

  async function runClearTestData() {
    setTestDataBusy(true);
    setError(null);
    setMessage(null);
    setTestDataSummary(null);
    try {
      const result = await api.clearTestData();
      setTestDataSummary(formatClearSummary(result));
      setTestDataConfirm(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTestDataBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>League Admin</h2>
      {error && <p className="error inline-error">{error}</p>}
      {message && <p className="message">{message}</p>}

      <div className="waiver-admin">
        <h3>Waivers to approve</h3>
        {pendingWaivers.length === 0 ? (
          <p className="muted-copy">No pending waivers.</p>
        ) : (
          <ul className="member-list">
            {pendingWaivers.map((row) => (
              <li key={row.id} className="member-row">
                <div className="member-info">
                  <span className="member-name">{row.name}</span>
                  <span className="member-meta">{row.teamName ?? 'Free agent'}</span>
                </div>
                {row.waiverUrl && (
                  <a className="link-btn" href={row.waiverUrl} target="_blank" rel="noreferrer">
                    View
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void api.reviewWaiver(row.id, 'approved').then(() => load());
                  }}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="link-btn danger"
                  onClick={() => {
                    void api.reviewWaiver(row.id, 'rejected').then(() => load());
                  }}
                >
                  Send back
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ColorSchemeAdmin
        onError={setError}
        onMessage={setMessage}
      />

      <div className="mail-panel">
        <h3>Signup emails</h3>
        {mailStatus?.configured ? (
          <>
            <p className="theme-help">
              On via {mailStatus.transport === 'resend' ? 'Resend' : 'SMTP'}. New players get a
              welcome email, and{' '}
              {mailStatus.notifyEmails.length
                ? mailStatus.notifyEmails.join(', ')
                : 'no commissioner inbox'}{' '}
              get a signup notice.
            </p>
            <button
              type="button"
              className="primary-btn"
              disabled={mailTestBusy}
              onClick={() => void sendTestMail()}
            >
              {mailTestBusy ? 'Sending…' : 'Send test email'}
            </button>
          </>
        ) : (
          <p className="theme-help">
            Off until the host has <code>RESEND_API_KEY</code> or SMTP settings and{' '}
            <code>SIGNUP_NOTIFY_EMAIL</code> is a real inbox. Signups still work.
          </p>
        )}
      </div>

      <div className="sheets-panel">
        <h3>Player stats Google Sheet</h3>
        <p className="theme-help">
          Writes batting stats (GP, Hits, AB, AVG, 1B, 2B, 3B, HR, K, Out) to the{' '}
          <code>Player Stats</code> tab. Each team gets 15 roster spots. Other tabs stay untouched.{' '}
          {sheetStatus?.spreadsheetUrl ? (
            <a href={sheetStatus.spreadsheetUrl} target="_blank" rel="noreferrer">
              Open the sheet
            </a>
          ) : (
            'Spreadsheet ID is saved on the server.'
          )}
        </p>
        {sheetStatus && (
          <p className="theme-help">
            {sheetStatus.playerCount} players across {sheetStatus.teamCount} teams
            {sheetStatus.freeAgentCount ? ` · ${sheetStatus.freeAgentCount} free agents` : ''}.
            {sheetStatus.configured
              ? ' Google credentials are configured — Update writes the live sheet.'
              : ' No Google credentials on this host — use Preview or Download CSV and paste.'}
            {sheetStatus.lastSyncAt
              ? ` Last ${sheetStatus.lastSyncStatus ?? 'sync'}: ${new Date(sheetStatus.lastSyncAt).toLocaleString()}.`
              : ''}
          </p>
        )}
        <div className="test-data-actions">
          <button
            type="button"
            className="primary-btn"
            disabled={sheetBusy !== null}
            onClick={() => void syncPlayerStatsSheet(false)}
          >
            {sheetBusy === 'sync' ? 'Updating…' : 'Update Google Sheet'}
          </button>
          <button
            type="button"
            className="link-btn"
            disabled={sheetBusy !== null}
            onClick={() => void syncPlayerStatsSheet(true)}
          >
            {sheetBusy === 'preview' ? 'Previewing…' : 'Preview rows'}
          </button>
          <button
            type="button"
            className="link-btn"
            disabled={sheetBusy !== null}
            onClick={() => void downloadPlayerStatsCsv()}
          >
            {sheetBusy === 'csv' ? 'Downloading…' : 'Download CSV'}
          </button>
        </div>
      </div>

      <div className="test-data-panel">
        <h3>Test Data (simulation)</h3>
        <p className="test-data-warning">
          For testing only. Generates a full 11-week season: 15 rostered guests per team, free agents,
          profiles (number, position, skill, phone, waiver), weekly check-ins and 10-man lineups, team chat,
          FA invites, and play-by-play for every game. Guests use <code>@sim.local</code>. Clear removes
          those guests and resets standings — demo accounts, teams, landing, and rules stay put.
        </p>
        {testDataSummary && <p className="message">{testDataSummary}</p>}
        {testDataConfirm === 'generate' ? (
          <div className="test-data-confirm">
            <p>Create 15-man rosters, free agents, and a scored 11-week season?</p>
            <div className="test-data-actions">
              <button
                type="button"
                className="primary-btn"
                disabled={testDataBusy}
                onClick={() => void runGenerateTestData()}
              >
                {testDataBusy ? 'Generating…' : 'Confirm generate'}
              </button>
              <button
                type="button"
                className="link-btn"
                disabled={testDataBusy}
                onClick={() => setTestDataConfirm(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : testDataConfirm === 'clear' ? (
          <div className="test-data-confirm">
            <p>Remove all <code>@sim.local</code> guests and reset every game to unplayed?</p>
            <div className="test-data-actions">
              <button
                type="button"
                className="test-data-clear-btn"
                disabled={testDataBusy}
                onClick={() => void runClearTestData()}
              >
                {testDataBusy ? 'Clearing…' : 'Confirm clear'}
              </button>
              <button
                type="button"
                className="link-btn"
                disabled={testDataBusy}
                onClick={() => setTestDataConfirm(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="test-data-actions">
            <button
              type="button"
              className="primary-btn"
              disabled={testDataBusy}
              onClick={() => {
                setTestDataSummary(null);
                setTestDataConfirm('generate');
              }}
            >
              Generate test data
            </button>
            <button
              type="button"
              className="test-data-clear-btn"
              disabled={testDataBusy}
              onClick={() => {
                setTestDataSummary(null);
                setTestDataConfirm('clear');
              }}
            >
              Clear test data
            </button>
          </div>
        )}
      </div>

      <h3>Suggestions</h3>
      {/* Routing suggestions to an external place can be added later; for now admins view them in-app. */}
      {suggestions.length === 0 ? (
        <p className="member-empty">No suggestions yet.</p>
      ) : (
        <ul className="suggestion-list">
          {suggestions.map((s) => (
            <li key={s.id} className="suggestion-row">
              <div className="suggestion-main">
                <p className="suggestion-text">{s.text}</p>
                <p className="suggestion-meta">
                  {s.authorName?.trim() || 'Anonymous'}
                  {' · '}
                  {formatSuggestionDate(s.createdAt)}
                </p>
              </div>
              <button
                type="button"
                className="link-btn danger"
                onClick={() => removeSuggestion(s.id)}
                aria-label={`Delete suggestion from ${s.authorName?.trim() || 'Anonymous'}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="admin-users-heading">Teams</h3>
      <ul className="user-list">
        {teams.map((t) => (
          <li key={t.id} className="user-row">
            <form className="add-row team-rename-row" onSubmit={(e) => renameTeam(e, t.id)}>
              <input
                aria-label={`Name for ${t.name}`}
                value={drafts[t.id] ?? t.name}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))}
              />
              <button type="submit">Rename</button>
            </form>
          </li>
        ))}
      </ul>

      <h3>Add a team</h3>
      <form className="add-row" onSubmit={addTeam}>
        <input aria-label="New team name" placeholder="New team name" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} required />
        <button type="submit">Create team</button>
      </form>

      <h3 className="admin-users-heading">Promote players to manager</h3>
      {openTeams.length === 0 ? (
        <p className="member-empty">Every team already has 2 managers.</p>
      ) : playerAccounts.length === 0 ? (
        <p className="member-empty">No player accounts to promote yet.</p>
      ) : (
        <form className="mgr-auth-form" onSubmit={authorizeManagers}>
          <label className="field">
            Team with an open manager spot:{' '}
            <select
              aria-label="Team with an open manager spot"
              value={mgrTeamId}
              onChange={(e) => setMgrTeamId(e.target.value)}
              required
            >
              {openTeams.map((t) => {
                const filled = managerCountByTeam.get(t.id) ?? 0;
                return (
                  <option key={t.id} value={t.id}>
                    {t.name} · {filled}/{MANAGERS_PER_TEAM} managers
                  </option>
                );
              })}
            </select>
          </label>
          <label className="field">
            Player:{' '}
            <select
              aria-label="Player to promote"
              value={mgrPlayerId}
              onChange={(e) => setMgrPlayerId(e.target.value)}
              required
            >
              {playerAccounts.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Also plays:{' '}
            <select
              aria-label="Manager roster option"
              value={mgrOnRoster ? 'player' : 'only'}
              onChange={(e) => setMgrOnRoster(e.target.value === 'player')}
            >
              <option value="player">Yes — for this team</option>
              <option value="only">Manager only</option>
            </select>
          </label>
          <p className="theme-help">
            Each team has 2 manager spots so a backup can keep score if the other is out.
            Only teams with an open spot are listed. Playing managers stay on the team they
            manage.
          </p>
          <button className="primary-btn" type="submit" disabled={authorizing || !mgrTeamId || !mgrPlayerId}>
            {authorizing ? 'Promoting…' : 'Promote to manager'}
          </button>
        </form>
      )}
      {authorizations.length === 0 ? (
        <p className="member-empty">No team managers yet.</p>
      ) : (
        <ul className="user-list">
          {authorizations.map((row) => (
            <li key={`${row.status}:${row.email}:${row.teamId}`} className="user-row">
              <div className="user-row-main">
                <span className="team-cell">{row.email}</span>
                <span className={`status-badge status-${row.status}`}>
                  {row.status === 'active' ? 'Active' : 'Pending'}
                </span>
              </div>
              <div className="role-controls">
                <span className="manager-of">
                  {row.teamName}
                  {row.onRoster === false ? ' · manager only' : ' · plays for this team'}
                </span>
                <button
                  type="button"
                  className="link-btn danger"
                  onClick={() => revokeAuthorization(row.email)}
                  aria-label={`Remove ${row.email}`}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="admin-users-heading">Players &amp; roles</h3>
      <p className="theme-help">
        There is one league admin. You can promote players to manager, but not to admin.
      </p>
      <ul className="user-list">
        {users.map((u) => (
          <li key={u.id} className="user-row">
            <div className="user-row-main">
              <span className="team-cell">{u.name}</span>
              <span className="user-email">{u.email}</span>
            </div>
            <div className="role-controls">
              <select
                aria-label={`Role for ${u.name}`}
                value={u.role}
                disabled={u.role === 'admin' || u.id === me?.id}
                onChange={(e) => {
                  const role = e.target.value as Role;
                  changeRole(u, role, role === 'manager' ? u.teamId ?? openTeams[0]?.id ?? u.teamId ?? null : null);
                }}
              >
                {u.role === 'admin' ? (
                  <option value="admin">Admin</option>
                ) : (
                  <>
                    <option value="player">Player</option>
                    <option value="manager">Team Manager</option>
                  </>
                )}
              </select>
              {u.role === 'manager' && (
                <select
                  aria-label={`Team for ${u.name}`}
                  value={u.teamId ?? ''}
                  onChange={(e) => changeRole(u, 'manager', e.target.value, u.onRoster !== false)}
                >
                  {teams
                    .filter((t) => t.id === u.teamId || (managerCountByTeam.get(t.id) ?? 0) < MANAGERS_PER_TEAM)
                    .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              {u.role === 'manager' && (
                <select
                  aria-label={`Manager type for ${u.name}`}
                  value={u.onRoster === false ? 'only' : 'player'}
                  onChange={(e) => changeRole(u, 'manager', u.teamId, e.target.value === 'player')}
                >
                  <option value="player">Plays for this team</option>
                  <option value="only">Manager only</option>
                </select>
              )}
              {u.role === 'manager' && u.teamId && (
                <span className="manager-of">of {teamName.get(u.teamId) ?? u.teamId}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatSuggestionDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10.5V20h14v-9.5" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4h12v3a6 6 0 0 1-12 0V4z" />
      <path d="M6 6H4a2 2 0 0 0 0 4h2M18 6h2a2 2 0 0 1 0 4h-2" />
      <path d="M9 17h6M10 17v3M14 17v3M8 20h8" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  );
}

function RosterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 6a3 3 0 0 1 0 6M18 20a6 6 0 0 0-3-5.2" />
    </svg>
  );
}

function RulesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z" />
      <path d="M4 19a2 2 0 0 0 2 2h13" />
      <path d="M8 7h7M8 11h7" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
    </svg>
  );
}
