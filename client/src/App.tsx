import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api, type CurrentWeek, type Game, type Landing, type ManagerAuthorization, type Player, type PlayerAccount, type Role, type StandingRow, type Suggestion, type Team, type TeamAttendance, type TeamMember, type TeamMessage, type TestDataClearResult, type TestDataGenerateResult, type Theme, type ThemeId, type User } from './api';
import { useAuth } from './auth';
import { fileToBannerDataUrl, fileToSquareDataUrl } from './image';
import { applyTheme } from './theme';

type Tab = 'home' | 'standings' | 'schedule' | 'rosters' | 'rules' | 'admin';

const TAB_TITLES: Record<Tab, string> = {
  home: 'Home',
  standings: 'Standings',
  schedule: 'Schedule',
  rosters: 'Rosters',
  rules: 'Rules',
  admin: 'Admin',
};

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

function roleLabel(role: Role): string {
  if (role === 'admin') return 'Admin';
  if (role === 'manager') return 'Team Manager';
  return 'Player';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function App() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('home');
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // If a non-admin lands on the admin tab (e.g. after logout), bounce them out.
  useEffect(() => {
    if (tab === 'admin' && user?.role !== 'admin') setTab('home');
  }, [tab, user]);

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
            <span className="app-bar-sub">{TAB_TITLES[tab]}</span>
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
            <AuthControl onSignIn={() => setAuthOpen(true)} onEditProfile={() => setProfileOpen(true)} />
          </div>
        </div>
      </header>

      <main className="app-content">
        {tab === 'home' && <LandingPage />}
        {tab === 'standings' && <Standings />}
        {tab === 'schedule' && <Schedule />}
        {tab === 'rosters' && <Rosters />}
        {tab === 'rules' && <Rules />}
        {tab === 'admin' && user?.role === 'admin' && <Admin />}
      </main>

      <nav className="tab-bar" role="tablist" aria-label="Main navigation">
        <TabButton tab="home" current={tab} onSelect={setTab} label="Home" icon={HomeIcon} />
        <TabButton tab="standings" current={tab} onSelect={setTab} label="Standings" icon={TrophyIcon} />
        <TabButton tab="schedule" current={tab} onSelect={setTab} label="Schedule" icon={CalendarIcon} />
        <TabButton tab="rosters" current={tab} onSelect={setTab} label="Rosters" icon={RosterIcon} />
        <TabButton tab="rules" current={tab} onSelect={setTab} label="Rules" icon={RulesIcon} />
        {user?.role === 'admin' && (
          <TabButton tab="admin" current={tab} onSelect={setTab} label="Admin" icon={GearIcon} />
        )}
      </nav>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      {profileOpen && user && <ProfileModal onClose={() => setProfileOpen(false)} />}
      {chatOpen && user && canOpenTeamChat(user) && <TeamChatModal onClose={() => setChatOpen(false)} />}
    </div>
  );
}

function AuthControl({ onSignIn, onEditProfile }: { onSignIn: () => void; onEditProfile: () => void }) {
  const { user, logout } = useAuth();
  if (!user) {
    return (
      <button className="signin-btn" onClick={onSignIn}>
        Sign in
      </button>
    );
  }
  return (
    <div className="user-chip">
      <button className="user-chip-btn" type="button" onClick={onEditProfile} aria-label="Edit profile">
        {user.photoUrl ? (
          <img className="avatar" src={user.photoUrl} alt="" />
        ) : (
          <span className="avatar avatar-initials" aria-hidden="true">
            {initials(user.name)}
          </span>
        )}
        <div className="user-meta">
          <span className="user-name">{user.name}</span>
          <span className="user-role">{roleLabel(user.role)}</span>
        </div>
      </button>
      <button className="signout-btn" onClick={() => logout()} aria-label="Sign out">
        Sign out
      </button>
    </div>
  );
}

function AuthModal({ onClose }: { onClose: () => void }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
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
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [position, setPosition] = useState(user?.position ?? '');
  const [number, setNumber] = useState(user?.number != null ? String(user.number) : '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(user?.photoUrl ?? null);
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
          {error && <p className="error inline-error">{error}</p>}
          <button className="primary-btn" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save profile'}
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

function LandingPage() {
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
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[date.getUTCDay()]} ${MONTHS[m - 1]} ${d}`;
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
      <span className="game-att-name">{name}:</span> 🥎 {a.in} · 💩 {a.out} · — {a.none}
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

function Schedule() {
  const { user } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [weeks, setWeeks] = useState('11');
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');

  const isAdmin = user?.role === 'admin';
  const weekGroups = useMemo(() => groupGamesByWeek(games), [games]);

  function load() {
    api.getSchedule().then(setGames).catch((e) => setError(e.message));
  }
  useEffect(load, []);

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
      setExpanded(null);
      setEditing(null);
      setMessage(`Generated ${next.length} games from the current teams.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function startEdit(g: Game) {
    setEditing(g.id);
    setExpanded(g.id);
    setHome(g.homeScore?.toString() ?? '');
    setAway(g.awayScore?.toString() ?? '');
    setMessage(null);
  }

  async function saveScore(g: Game) {
    try {
      await api.recordResult(g.id, Number(home), Number(away));
      setEditing(null);
      load();
      setMessage('Score saved!');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const canReport = (g: Game) =>
    canManageTeam(user, g.homeTeamId) || canManageTeam(user, g.awayTeamId);

  function toggleGame(id: string) {
    setExpanded((current) => (current === id ? null : id));
    if (editing && editing !== id) setEditing(null);
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
      {weekGroups.map((group) => (
        <div key={`${group.week}-${group.date}`} className="week-group">
          <h3 className="week-heading">
            {group.week ? `Week ${group.week} — ${formatGameDate(group.date)}` : formatGameDate(group.date)}
          </h3>
          <ul className="games">
            {group.games.map((g) => {
              const isOpen = expanded === g.id;
              return (
                <li key={g.id} className={`game ${g.played ? 'played' : 'upcoming'} ${isOpen ? 'expanded' : ''}`}>
                  <button
                    type="button"
                    className="game-toggle"
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? 'Hide' : 'Show'} details for ${g.awayTeamName} at ${g.homeTeamName} on ${formatGameDate(g.date)}`}
                    onClick={() => toggleGame(g.id)}
                  >
                    <span className="game-date">{formatGameDate(g.date)}</span>
                    <span className="game-teams">
                      <span className="game-team">
                        {g.awayTeamName} <AttendanceChip attendance={g.awayAttendance} />
                      </span>
                      <span className="at">@</span>
                      <span className="game-team">
                        {g.homeTeamName} <AttendanceChip attendance={g.homeAttendance} />
                      </span>
                    </span>
                    <span className="game-score">
                      {g.played ? `${g.awayScore} - ${g.homeScore}` : 'Upcoming'}
                    </span>
                    <span className="game-chevron" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="game-details">
                      <dl className="game-meta">
                        <div>
                          <dt>Time</dt>
                          <dd>{g.time || 'TBD'}</dd>
                        </div>
                        <div>
                          <dt>Field</dt>
                          <dd>{g.field || 'TBD'}</dd>
                        </div>
                        <div>
                          <dt>Location</dt>
                          <dd>{g.location || 'Kerr Park'}</dd>
                        </div>
                        <div>
                          <dt>Week</dt>
                          <dd>{g.week || '—'}</dd>
                        </div>
                      </dl>
                      <div className="game-attendance">
                        <AttendanceBreakdown name={g.awayTeamName} attendance={g.awayAttendance} />
                        <AttendanceBreakdown name={g.homeTeamName} attendance={g.homeAttendance} />
                      </div>
                      {editing === g.id ? (
                        <div className="score-edit">
                          <input
                            aria-label={`${g.awayTeamName} score`}
                            type="number"
                            value={away}
                            onChange={(e) => setAway(e.target.value)}
                          />
                          <span className="at">-</span>
                          <input
                            aria-label={`${g.homeTeamName} score`}
                            type="number"
                            value={home}
                            onChange={(e) => setHome(e.target.value)}
                          />
                          <button className="mini-btn" onClick={() => saveScore(g)}>
                            Save
                          </button>
                        </div>
                      ) : (
                        canReport(g) && (
                          <div className="game-actions">
                            <button className="link-btn" onClick={() => startEdit(g)}>
                              {g.played ? 'Edit score' : 'Report score'}
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Rosters() {
  const { user, refresh } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [roster, setRoster] = useState<Player[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [currentWeek, setCurrentWeek] = useState<CurrentWeek | null>(null);
  const [managerName, setManagerName] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [accounts, setAccounts] = useState<PlayerAccount[]>([]);
  const [pickMember, setPickMember] = useState('');
  const [joinPick, setJoinPick] = useState('');
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [position, setPosition] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [teamNameDraft, setTeamNameDraft] = useState('');
  const [teamPhotoPreview, setTeamPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    api.getTeams().then((t) => {
      setTeams(t);
      const pinned =
        user?.teamId && (user.role === 'manager' || user.role === 'player') ? user.teamId : '';
      const initial = pinned || t[0]?.id || '';
      setSelected(initial);
      setJoinPick(pinned || t[0]?.id || '');
    });
  }, [user]);

  const canManage = user?.role === 'admin' || user?.role === 'manager';

  useEffect(() => {
    if (!canManage) return;
    api.listMembers().then(setAccounts).catch(() => setAccounts([]));
  }, [canManage, selected]);

  function loadRoster(teamId: string) {
    if (!teamId) return;
    api.getRoster(teamId).then((r) => {
      setRoster(r.roster);
      setMembers(r.members ?? []);
      setCurrentWeek(r.currentWeek ?? null);
      setManagerName(r.manager?.name ?? null);
      setTeams((prev) => prev.map((t) => (t.id === r.team.id ? r.team : t)));
    });
  }
  useEffect(() => loadRoster(selected), [selected]);

  const selectedTeam = teams.find((t) => t.id === selected);
  const canEdit = canManageTeam(user, selected);
  const availableAccounts = accounts.filter((a) => a.teamId !== selected);
  const pickValue = availableAccounts.some((a) => a.id === pickMember)
    ? pickMember
    : availableAccounts[0]?.id ?? '';

  useEffect(() => {
    setTeamNameDraft(selectedTeam?.name ?? '');
    setTeamPhotoPreview(selectedTeam?.photoUrl ?? null);
  }, [selectedTeam?.id, selectedTeam?.name, selectedTeam?.photoUrl]);

  function patchTeam(updated: Team) {
    setTeams((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      const updated = await api.renameTeam(selected, teamNameDraft);
      patchTeam(updated);
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
      const updated = await api.setTeamPhoto(selected, dataUrl);
      patchTeam(updated);
      setMessage('Team photo saved.');
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await api.addPlayer({ teamId: selected, name, number: Number(number), position });
      loadRoster(selected);
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
      loadRoster(selected);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await api.joinTeam(joinPick || null);
      await refresh();
      if (joinPick) setSelected(joinPick);
      loadRoster(joinPick);
      setMessage('Joined the team.');
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleChangeTeam(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await api.joinTeam(joinPick || null);
      await refresh();
      if (joinPick) setSelected(joinPick);
      loadRoster(joinPick);
      setMessage('Team updated.');
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleLeave() {
    setMessage(null);
    try {
      await api.joinTeam(null);
      await refresh();
      loadRoster(selected);
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
      await api.setUserTeam(pickValue, selected);
      loadRoster(selected);
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
      loadRoster(selected);
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
      loadRoster(selected);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setCheckingIn(false);
    }
  }

  const playerTeamName = user?.teamId
    ? teams.find((t) => t.id === user.teamId)?.name ?? user.teamId
    : null;

  const canCheckIn = Boolean(user && user.teamId === selected && currentWeek);
  const myCheckIn = members.find((m) => m.id === user?.id)?.checkIn ?? null;
  const checkInCounts = {
    in: members.filter((m) => m.checkIn === 'in').length,
    out: members.filter((m) => m.checkIn === 'out').length,
    none: members.filter((m) => m.checkIn !== 'in' && m.checkIn !== 'out').length,
  };

  return (
    <section className="card">
      <h2>Team Rosters</h2>

      {user?.role === 'player' && (
        <div className="join-bar">
          {user.teamId && playerTeamName ? (
            <>
              <p className="join-status">
                You&apos;re on {playerTeamName} — Change / Leave
              </p>
              <form className="add-row" onSubmit={handleChangeTeam}>
                <label className="field inline">
                  Change team:{' '}
                  <select
                    aria-label="Change team"
                    value={joinPick}
                    onChange={(e) => setJoinPick(e.target.value)}
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit">Change</button>
                <button type="button" className="link-btn danger" onClick={handleLeave}>
                  Leave
                </button>
              </form>
            </>
          ) : (
            <form className="add-row" onSubmit={handleJoin}>
              <label className="field inline">
                Join a team:{' '}
                <select
                  aria-label="Join a team"
                  value={joinPick}
                  onChange={(e) => setJoinPick(e.target.value)}
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit">Join</button>
            </form>
          )}
        </div>
      )}

      <label className="field">
        Team:{' '}
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      {selectedTeam && (
        <div className="roster-team-header">
          {selectedTeam.photoUrl ? (
            <img className="team-logo" src={selectedTeam.photoUrl} alt="" />
          ) : (
            <span className="team-logo team-logo-placeholder" aria-hidden="true">
              {initials(selectedTeam.name)}
            </span>
          )}
          <div>
            <h3 className="roster-team-name">{selectedTeam.name}</h3>
            {managerName && <p className="roster-manager">Manager: {managerName}</p>}
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
              🥎 {checkInCounts.in} · 💩 {checkInCounts.out} · — {checkInCounts.none}
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
                  🥎
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
                  💩
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
            value={teamPhotoPreview ?? selectedTeam?.photoUrl}
            onFile={handleTeamPhoto}
          />
        </div>
      )}

      {message && <p className="message">{message}</p>}

      <h3 className="roster-heading">Members</h3>
      {members.length === 0 ? (
        <p className="member-empty">No registered members yet.</p>
      ) : (
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.id} className="member-row">
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
                  {m.number != null ? `#${m.number}` : ''}
                  {m.number != null && m.position ? ' · ' : ''}
                  {m.position ?? ''}
                </span>
              </div>
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
                  {m.checkIn === 'in' ? '🥎' : m.checkIn === 'out' ? '💩' : '—'}
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
        </ul>
      )}

      {canEdit && (
        <form className="add-form" onSubmit={handleAddMember}>
          <h3>Add a registered player</h3>
          {availableAccounts.length === 0 ? (
            <p className="member-empty">Every registered player is already on this team.</p>
          ) : (
            <div className="add-row">
              <select
                aria-label="Registered player"
                value={pickValue}
                onChange={(e) => setPickMember(e.target.value)}
              >
                {availableAccounts.map((a) => (
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

      <h3 className="roster-heading">Unregistered</h3>
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Position</th>
            {canEdit && <th />}
          </tr>
        </thead>
        <tbody>
          {roster.map((p) => (
            <tr key={p.id}>
              <td>{p.number}</td>
              <td className="team-cell">{p.name}</td>
              <td>{p.position}</td>
              {canEdit && (
                <td>
                  <button className="link-btn danger" onClick={() => handleRemove(p.id)} aria-label={`Remove ${p.name}`}>
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

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
  const [selected, setSelected] = useState<ThemeId>('classic');
  const [primary, setPrimary] = useState('#0b2545');
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
  const [mgrEmails, setMgrEmails] = useState('');
  const [mgrTeamId, setMgrTeamId] = useState('');
  const [authorizations, setAuthorizations] = useState<ManagerAuthorization[]>([]);
  const [authorizing, setAuthorizing] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [testDataConfirm, setTestDataConfirm] = useState<'generate' | 'clear' | null>(null);
  const [testDataBusy, setTestDataBusy] = useState(false);
  const [testDataSummary, setTestDataSummary] = useState<string | null>(null);

  const teamName = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);

  function load() {
    api.listUsers().then(setUsers).catch((e) => setError(e.message));
    api
      .getTeams()
      .then((next) => {
        setTeams(next);
        setDrafts(Object.fromEntries(next.map((t) => [t.id, t.name])));
        setMgrTeamId((current) => current || next[0]?.id || '');
      })
      .catch((e) => setError(e.message));
    api.listManagerEmails().then(setAuthorizations).catch((e) => setError(e.message));
    api.listSuggestions().then(setSuggestions).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function changeRole(u: User, role: Role, teamId: string | null) {
    setError(null);
    setMessage(null);
    try {
      await api.setUserRole(u.id, role, teamId);
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
      const result = await api.authorizeManagers(mgrEmails, mgrTeamId);
      setMessage(`Promoted ${result.promoted.length}, pending ${result.pending.length}`);
      setMgrEmails('');
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

      <ColorSchemeAdmin
        onError={setError}
        onMessage={setMessage}
      />

      <div className="test-data-panel">
        <h3>Test Data (simulation)</h3>
        <p className="test-data-warning">
          For testing only. Generates 72 guest players (<code>@sim.local</code>), check-ins, team chat, and
          season scores. Clear removes those guests and resets standings — demo accounts, teams, landing, and
          rules stay put.
        </p>
        {testDataSummary && <p className="message">{testDataSummary}</p>}
        {testDataConfirm === 'generate' ? (
          <div className="test-data-confirm">
            <p>Create 72 guest accounts, fill check-ins/chat, and score the season?</p>
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

      <h3 className="admin-users-heading">Team Managers (by email)</h3>
      <form className="mgr-auth-form" onSubmit={authorizeManagers}>
        <label className="field">
          Emails
          <textarea
            aria-label="Manager emails"
            placeholder="one@example.com, two@example.com"
            value={mgrEmails}
            onChange={(e) => setMgrEmails(e.target.value)}
            rows={3}
            required
          />
        </label>
        <label className="field">
          Team:{' '}
          <select
            aria-label="Manager team"
            value={mgrTeamId}
            onChange={(e) => setMgrTeamId(e.target.value)}
            required
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-btn" type="submit" disabled={authorizing || !mgrTeamId}>
          {authorizing ? 'Authorizing…' : 'Authorize'}
        </button>
      </form>
      {authorizations.length === 0 ? (
        <p className="member-empty">No manager authorizations yet.</p>
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
                <span className="manager-of">{row.teamName}</span>
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
                disabled={u.id === me?.id}
                onChange={(e) => {
                  const role = e.target.value as Role;
                  changeRole(u, role, role === 'manager' ? u.teamId ?? teams[0]?.id ?? null : null);
                }}
              >
                <option value="player">Player</option>
                <option value="manager">Team Manager</option>
                <option value="admin">Admin</option>
              </select>
              {u.role === 'manager' && (
                <select
                  aria-label={`Team for ${u.name}`}
                  value={u.teamId ?? ''}
                  onChange={(e) => changeRole(u, 'manager', e.target.value)}
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
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
