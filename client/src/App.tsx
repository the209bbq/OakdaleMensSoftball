import { useEffect, useState } from 'react';
import { api, type Game, type Player, type StandingRow, type Team } from './api';

type Tab = 'standings' | 'schedule' | 'rosters';

export default function App() {
  const [tab, setTab] = useState<Tab>('standings');

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-inner">
          <span className="badge">EST. 2026</span>
          <h1>Oakdale Men's Softball League</h1>
          <p>Standings, schedules, and team rosters for the Oakdale summer season.</p>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === 'standings' ? 'active' : ''} onClick={() => setTab('standings')}>
          Standings
        </button>
        <button className={tab === 'schedule' ? 'active' : ''} onClick={() => setTab('schedule')}>
          Schedule
        </button>
        <button className={tab === 'rosters' ? 'active' : ''} onClick={() => setTab('rosters')}>
          Rosters
        </button>
      </nav>

      <main className="content">
        {tab === 'standings' && <Standings />}
        {tab === 'schedule' && <Schedule />}
        {tab === 'rosters' && <Rosters />}
      </main>

      <footer className="footer">Oakdale Men's Softball &middot; Play ball!</footer>
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
