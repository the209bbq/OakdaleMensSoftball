import { useEffect, useMemo, useState } from 'react';
import { api, type Game, type Player, type Role, type StandingRow, type Team, type User } from './api';
import { useAuth } from './auth';

type Tab = 'standings' | 'schedule' | 'rosters' | 'rules' | 'admin';

const TAB_TITLES: Record<Tab, string> = {
  standings: 'Standings',
  schedule: 'Schedule',
  rosters: 'Rosters',
  rules: 'Rules',
  admin: 'Admin',
};

/** Admins manage any team; captains only their assigned team. */
function canManageTeam(user: User | null, teamId: string | null): boolean {
  if (!user || !teamId) return false;
  if (user.role === 'admin') return true;
  return user.role === 'captain' && user.teamId === teamId;
}

export default function App() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('standings');
  const [authOpen, setAuthOpen] = useState(false);

  // If a non-admin lands on the admin tab (e.g. after logout), bounce them out.
  useEffect(() => {
    if (tab === 'admin' && user?.role !== 'admin') setTab('standings');
  }, [tab, user]);

  return (
    <div className="app-shell">
      <header className="app-bar">
        <div className="app-bar-inner">
          <img className="app-logo" src="/app-icon.svg" alt="" width="28" height="28" />
          <div className="app-bar-text">
            <span className="app-bar-title">Oakdale MSB</span>
            <span className="app-bar-sub">{TAB_TITLES[tab]}</span>
          </div>
          <AuthControl onSignIn={() => setAuthOpen(true)} />
        </div>
      </header>

      <main className="app-content">
        {tab === 'standings' && <Standings />}
        {tab === 'schedule' && <Schedule />}
        {tab === 'rosters' && <Rosters />}
        {tab === 'rules' && <Rules />}
        {tab === 'admin' && user?.role === 'admin' && <Admin />}
      </main>

      <nav className="tab-bar" role="tablist" aria-label="Main navigation">
        <TabButton tab="standings" current={tab} onSelect={setTab} label="Standings" icon={TrophyIcon} />
        <TabButton tab="schedule" current={tab} onSelect={setTab} label="Schedule" icon={CalendarIcon} />
        <TabButton tab="rosters" current={tab} onSelect={setTab} label="Rosters" icon={RosterIcon} />
        <TabButton tab="rules" current={tab} onSelect={setTab} label="Rules" icon={RulesIcon} />
        {user?.role === 'admin' && (
          <TabButton tab="admin" current={tab} onSelect={setTab} label="Admin" icon={GearIcon} />
        )}
      </nav>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  );
}

function AuthControl({ onSignIn }: { onSignIn: () => void }) {
  const { user, logout } = useAuth();
  if (!user) {
    return (
      <button className="signin-btn" onClick={onSignIn}>
        Sign in
      </button>
    );
  }
  const roleLabel = user.role === 'captain' ? 'Captain' : user.role === 'admin' ? 'Admin' : 'Member';
  return (
    <div className="user-chip">
      <div className="user-meta">
        <span className="user-name">{user.name}</span>
        <span className="user-role">{roleLabel}</span>
      </div>
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

function Schedule() {
  const { user } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');

  const isAdmin = user?.role === 'admin';

  function load() {
    api.getSchedule().then(setGames).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function handleGenerate() {
    setGenerating(true);
    setMessage(null);
    setError(null);
    try {
      const next = await api.generateSchedule(startDate || undefined);
      setGames(next);
      setMessage(`Generated ${next.length} games from the current teams.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function startEdit(g: Game) {
    setEditing(g.id);
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
          <button className="generate-btn" onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating…' : 'Generate schedule from teams'}
          </button>
        </div>
      )}
      {message && <p className="message">{message}</p>}
      <ul className="games">
        {games.map((g) => (
          <li key={g.id} className={`game ${g.played ? 'played' : 'upcoming'}`}>
            <span className="game-date">{g.date}</span>
            <span className="game-teams">
              {g.awayTeamName} <span className="at">@</span> {g.homeTeamName}
            </span>
            {editing === g.id ? (
              <span className="score-edit">
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
              </span>
            ) : (
              <span className="game-score">
                {g.played ? `${g.awayScore} - ${g.homeScore}` : 'Upcoming'}
                {canReport(g) && (
                  <button className="link-btn" onClick={() => startEdit(g)}>
                    {g.played ? 'Edit' : 'Report'}
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Rosters() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [roster, setRoster] = useState<Player[]>([]);
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [position, setPosition] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.getTeams().then((t) => {
      setTeams(t);
      // Captains default to their own team.
      const initial = user?.role === 'captain' && user.teamId ? user.teamId : t[0]?.id ?? '';
      setSelected(initial);
    });
  }, [user]);

  function loadRoster(teamId: string) {
    if (!teamId) return;
    api.getRoster(teamId).then((r) => setRoster(r.roster));
  }
  useEffect(() => loadRoster(selected), [selected]);

  const canEdit = canManageTeam(user, selected);

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

  return (
    <section className="card">
      <h2>Team Rosters</h2>
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
          {message && <p className="message">{message}</p>}
        </form>
      ) : (
        message && <p className="message">{message}</p>
      )}
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

function Admin() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newTeam, setNewTeam] = useState('');

  const teamName = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);

  function load() {
    api.listUsers().then(setUsers).catch((e) => setError(e.message));
    api.getTeams().then(setTeams).catch((e) => setError(e.message));
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

  return (
    <section className="card">
      <h2>League Admin</h2>
      {error && <p className="error inline-error">{error}</p>}
      {message && <p className="message">{message}</p>}

      <h3>Add a team</h3>
      <form className="add-row" onSubmit={addTeam}>
        <input aria-label="New team name" placeholder="New team name" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} required />
        <button type="submit">Create team</button>
      </form>

      <h3 className="admin-users-heading">Members &amp; roles</h3>
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
                  changeRole(u, role, role === 'captain' ? u.teamId ?? teams[0]?.id ?? null : null);
                }}
              >
                <option value="member">Member</option>
                <option value="captain">Captain</option>
                <option value="admin">Admin</option>
              </select>
              {u.role === 'captain' && (
                <select
                  aria-label={`Team for ${u.name}`}
                  value={u.teamId ?? ''}
                  onChange={(e) => changeRole(u, 'captain', e.target.value)}
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              {u.role === 'captain' && u.teamId && (
                <span className="captain-of">of {teamName.get(u.teamId) ?? u.teamId}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
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
