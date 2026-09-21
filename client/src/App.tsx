import { useEffect, useState } from 'react';
import { api, type Game, type Player, type StandingRow, type Team } from './api';

type Tab = 'standings' | 'schedule' | 'rosters';

const TAB_TITLES: Record<Tab, string> = {
  standings: 'Standings',
  schedule: 'Schedule',
  rosters: 'Rosters',
};

export default function App() {
  const [tab, setTab] = useState<Tab>('standings');

  return (
    <div className="app-shell">
      <header className="app-bar">
        <div className="app-bar-inner">
          <img className="app-logo" src="/app-icon.svg" alt="" width="28" height="28" />
          <div className="app-bar-text">
            <span className="app-bar-title">Oakdale MSB</span>
            <span className="app-bar-sub">{TAB_TITLES[tab]}</span>
          </div>
        </div>
      </header>

      <main className="app-content">
        {tab === 'standings' && <Standings />}
        {tab === 'schedule' && <Schedule />}
        {tab === 'rosters' && <Rosters />}
      </main>

      <nav className="tab-bar" role="tablist" aria-label="Main navigation">
        <TabButton tab="standings" current={tab} onSelect={setTab} label="Standings" icon={TrophyIcon} />
        <TabButton tab="schedule" current={tab} onSelect={setTab} label="Schedule" icon={CalendarIcon} />
        <TabButton tab="rosters" current={tab} onSelect={setTab} label="Rosters" icon={RosterIcon} />
      </nav>
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
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.getSchedule().then(setGames).catch((e) => setError(e.message));
  }, []);

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

  if (error) return <p className="error">{error}</p>;

  return (
    <section className="card">
      <h2>Season Schedule</h2>
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
      {message && <p className="message">{message}</p>}
      <ul className="games">
        {games.map((g) => (
          <li key={g.id} className={`game ${g.played ? 'played' : 'upcoming'}`}>
            <span className="game-date">{g.date}</span>
            <span className="game-teams">
              {g.awayTeamName} <span className="at">@</span> {g.homeTeamName}
            </span>
            <span className="game-score">
              {g.played ? `${g.awayScore} - ${g.homeScore}` : 'Upcoming'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Rosters() {
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
      if (t.length > 0) setSelected(t[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    api.getRoster(selected).then((r) => setRoster(r.roster));
  }, [selected]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await api.addPlayer({ teamId: selected, name, number: Number(number), position });
      const r = await api.getRoster(selected);
      setRoster(r.roster);
      setName('');
      setNumber('');
      setPosition('');
      setMessage('Player added!');
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
          </tr>
        </thead>
        <tbody>
          {roster.map((p) => (
            <tr key={p.id}>
              <td>{p.number}</td>
              <td className="team-cell">{p.name}</td>
              <td>{p.position}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <form className="add-form" onSubmit={handleAdd}>
        <h3>Add a player</h3>
        <div className="add-row">
          <input
            aria-label="Player name"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            aria-label="Jersey number"
            placeholder="#"
            type="number"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <input
            aria-label="Position"
            placeholder="Position"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          />
          <button type="submit">Add</button>
        </div>
        {message && <p className="message">{message}</p>}
      </form>
    </section>
  );
}
