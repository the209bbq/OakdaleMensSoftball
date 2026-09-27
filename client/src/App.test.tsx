import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { AuthProvider } from './auth';

const standings = [
  { teamId: 'tigers', teamName: 'Oakdale Tigers', wins: 2, losses: 0, ties: 0, runsFor: 18, runsAgainst: 8, gamesPlayed: 2 },
];

const scheduleGames = [
  {
    id: 'g1',
    date: '2026-05-06',
    homeTeamId: 'tigers',
    awayTeamId: 'beers',
    homeTeamName: 'Oakdale Tigers',
    awayTeamName: 'Da Beers',
    homeScore: null,
    awayScore: null,
    played: false,
    field: 'Field 1',
    time: '6:00 PM',
    location: 'Kerr Park',
    week: 1,
    awayAttendance: { in: 1, out: 1, none: 0, total: 2 },
    homeAttendance: { in: 0, out: 0, none: 0, total: 0 },
    box: {
      homeRuns: 0,
      awayRuns: 0,
      homeHits: 0,
      awayHits: 0,
      homeWalks: 0,
      awayWalks: 0,
      homeOuts: 0,
      awayOuts: 0,
      currentOuts: 0,
      awayLine: [0, 0, 0, 0, 0, 0, 0],
      homeLine: [0, 0, 0, 0, 0, 0, 0],
      currentInning: 1,
      currentHalf: 'top' as const,
      batterUp: 'away' as const,
    },
    scoring: {
      phase: 'upcoming' as const,
      open: false,
      opensAt: '2026-05-06T18:00:00.000Z',
      liveEndsAt: '2026-05-06T20:00:00.000Z',
      closesAt: '2026-05-07T20:00:00.000Z',
      liveStartedAt: null,
      canStart: false,
      canScore: false,
    },
    lineups: {
      away: {
        teamId: 'beers',
        slots: [
          { id: 'u-pat', name: 'Pat Lead', number: 1, stats: { gamesPlayed: 1, hits: 1, atBats: 2, average: '.500', singles: 1, doubles: 0, triples: 0, homers: 0, strikeouts: 0, outs: 1 } },
          { id: 'u-chris', name: 'Chris Deck', number: 2, stats: { gamesPlayed: 1, hits: 0, atBats: 1, average: '.000', singles: 0, doubles: 0, triples: 0, homers: 0, strikeouts: 1, outs: 0 } },
        ],
        atBat: { id: 'u-pat', name: 'Pat Lead', number: 1, stats: { gamesPlayed: 1, hits: 1, atBats: 2, average: '.500', singles: 1, doubles: 0, triples: 0, homers: 0, strikeouts: 0, outs: 1 } },
        onDeck: { id: 'u-chris', name: 'Chris Deck', number: 2, stats: { gamesPlayed: 1, hits: 0, atBats: 1, average: '.000', singles: 0, doubles: 0, triples: 0, homers: 0, strikeouts: 1, outs: 0 } },
        canEdit: false,
        locksAt: '2026-05-05T18:00:00.000Z',
        saved: true,
      },
      home: {
        teamId: 'tigers',
        slots: [{ id: 'u-david', name: 'David', number: 11, stats: { gamesPlayed: 0, hits: 0, atBats: 0, average: '.000', singles: 0, doubles: 0, triples: 0, homers: 0, strikeouts: 0, outs: 0 } }],
        atBat: { id: 'u-david', name: 'David', number: 11, stats: { gamesPlayed: 0, hits: 0, atBats: 0, average: '.000', singles: 0, doubles: 0, triples: 0, homers: 0, strikeouts: 0, outs: 0 } },
        onDeck: { id: 'u-david', name: 'David', number: 11, stats: { gamesPlayed: 0, hits: 0, atBats: 0, average: '.000', singles: 0, doubles: 0, triples: 0, homers: 0, strikeouts: 0, outs: 0 } },
        canEdit: false,
        locksAt: '2026-05-05T18:00:00.000Z',
        saved: true,
      },
    },
    plays: [],
  },
];

const teams = [{ id: 'tigers', name: 'Oakdale Tigers' }];

const landing = {
  headline: 'Welcome to the Oakdale Mens Softball League',
  body: 'Season updates and announcements will appear here. TODO: add real content.',
  imageUrl: null,
  countdownLabel: 'Opening Day',
  countdownTarget: null,
  effectiveCountdownTarget: null,
};

const theme = {
  id: 'classic' as const,
  label: 'Classic navy',
  primary: '#0b2545',
  accent: '#f2a900',
  navy: '#0b2545',
  navyLight: '#13315c',
  accentDark: '#d99400',
  bg: '#f4f6fb',
  card: '#ffffff',
  text: '#1b2733',
  muted: '#64748b',
  border: '#e2e8f0',
  heading: '#0b2545',
  onAccent: '#0b2545',
  presets: [
    { id: 'liberty' as const, label: 'Navy and gold', blurb: 'Navy, clean white, and a quiet gold', primary: '#1d3557', accent: '#f2a900' },
    { id: 'classic' as const, label: 'Classic navy', blurb: 'Original navy and gold', primary: '#0b2545', accent: '#f2a900' },
    { id: 'night' as const, label: 'Night game', blurb: 'Dark diamond, gold lights', primary: '#0a1220', accent: '#f2a900' },
    { id: 'grass' as const, label: 'Grass field', blurb: 'Green turf and yellow seams', primary: '#14532d', accent: '#facc15' },
    { id: 'clay' as const, label: 'Infield clay', blurb: 'Dirt infield and dusk gold', primary: '#7c2d12', accent: '#fbbf24' },
  ],
};

const rosterPayload = {
  team: teams[0],
  roster: [{ id: 'p1', teamId: 'tigers', name: 'Placeholder Guy', number: 9, position: 'OF' }],
  members: [
    { id: 'u-mgr', name: 'Coach', number: 1, position: 'P', isManager: true, checkIn: 'in' as const },
    { id: 'u1', name: 'Pat Shortstop', number: 12, position: 'SS', isManager: false, checkIn: null },
  ],
  manager: { name: 'Coach' },
  managers: [{ name: 'Coach', onRoster: true }],
  managerSpots: 2,
  currentWeek: { week: 1, date: '2026-05-06' },
  freeAgencyOpen: true,
};

const teamBoard = {
  currentWeek: { week: 1, date: '2026-05-06' },
  fullLineupSize: 10,
  rosterSpots: 15,
  managerSpots: 2,
  freeAgencyOpen: true,
  lastRegularSeasonDate: '2026-05-06',
  freeAgents: [{ id: 'u-fa', name: 'Free Agent Joe' }],
  teams: [
    {
      id: 'tigers',
      name: 'Oakdale Tigers',
      memberCount: 2,
      rosterFilled: 3,
      checkedInCount: 1,
      lineupStatus: 'need_guys' as const,
      manager: { name: 'Coach' },
      managers: [{ name: 'Coach', onRoster: true }],
      weekGame: {
        id: 'g1',
        date: '2026-05-06',
        time: '6:00 PM',
        field: 'Field 1',
        location: 'Kerr Park',
        opponentName: 'Da Beers',
        home: true,
      },
    },
  ],
};

const playerProfile = {
  id: 'u-fa',
  name: 'Free Agent Joe',
  number: 7,
  position: 'OF',
  photoUrl: undefined,
  skillLevel: 'regular' as const,
  teamId: null,
  teamName: null,
  isManager: false,
  waiverStatus: 'none' as const,
  waiverUrl: null,
  canReviewWaiver: false,
  phone: null,
  sharePhone: false,
  canSeePhone: false,
  stats: { gamesPlayed: 2, hits: 5, atBats: 12, average: '.417', singles: 3, doubles: 1, triples: 0, homers: 1, strikeouts: 2, outs: 5 },
};

function jsonOk(data: unknown) {
  return { ok: true, json: async () => data } as Response;
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/auth/me')) return jsonOk({ user: null });
      if (url.includes('/api/theme')) return jsonOk(theme);
      if (url.includes('/api/landing')) return jsonOk(landing);
      if (url.includes('/api/standings')) return jsonOk(standings);
      if (url.includes('/api/schedule')) return jsonOk(scheduleGames);
      if (url.includes('/api/games/') && !url.includes('/scorelog') && !url.includes('/lineups')) {
        return jsonOk(scheduleGames[0]);
      }
      if (url.includes('/messages')) return jsonOk([]);
      if (url.includes('/api/suggestions')) {
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body ?? '{}')) as { text?: string; name?: string };
          return jsonOk({
            id: 's1',
            text: body.text ?? '',
            authorName: body.name ?? null,
            createdAt: '2026-09-22T00:00:00.000Z',
          });
        }
        return jsonOk([]);
      }
      if (url.includes('/api/fa-invites')) return jsonOk([]);
      if (url.includes('/api/players/')) return jsonOk(playerProfile);
      if (url.includes('/api/team-board')) return jsonOk(teamBoard);
      if (url.includes('/roster')) return jsonOk(rosterPayload);
      if (url.includes('/api/teams')) return jsonOk(teams);
      return jsonOk([]);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
  sessionStorage.clear();
  document.body.style.overflow = '';
});

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );
}

describe('App', () => {
  it('renders the app bar title', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getAllByText(/Oakdale Mens Softball League/i).length).toBeGreaterThan(0);
    });
  });

  it('shows a Sign in button when logged out', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });
  });

  it('renders bottom tab navigation without an Admin tab when logged out', async () => {
    renderApp();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Standings' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Teams' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Admin' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Welcome to the Oakdale Mens Softball League')).toBeInTheDocument();
    });
  });

  it('opens on the Home tab and renders the landing headline', async () => {
    renderApp();
    expect(screen.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => {
      expect(screen.getByText('Welcome to the Oakdale Mens Softball League')).toBeInTheDocument();
    });
    expect(screen.getByText(/TODO: add real content/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('shows a signed-in player their team, next game, field, time, and check-in', async () => {
    const playerUser = {
      id: 'u1',
      email: 'pat@example.com',
      name: 'Pat Shortstop',
      role: 'player' as const,
      teamId: 'tigers',
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    let patCheckIn: 'in' | 'out' | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/api/auth/me')) return jsonOk({ user: playerUser });
        if (url.includes('/api/theme')) return jsonOk(theme);
        if (url.includes('/api/landing')) return jsonOk(landing);
        if (url.includes('/api/standings')) return jsonOk(standings);
        if (url.includes('/api/schedule')) return jsonOk(scheduleGames);
        if (url.includes('/api/games/') && !url.includes('/scorelog') && !url.includes('/lineups')) {
          return jsonOk(scheduleGames[0]);
        }
        if (url.includes('/api/checkin')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as { week: number; status: 'in' | 'out' | null };
          patCheckIn = body.status;
          return jsonOk({ ok: true, week: body.week, status: body.status });
        }
        if (url.includes('/roster')) {
          return jsonOk({
            ...rosterPayload,
            members: rosterPayload.members.map((m) =>
              m.id === 'u1' ? { ...m, checkIn: patCheckIn } : m,
            ),
          });
        }
        if (url.includes('/api/teams')) return jsonOk(teams);
        return jsonOk([]);
      }),
    );

    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Oakdale Tigers' })).toBeInTheDocument();
    });
    expect(screen.getByText('Hey Pat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit profile' })).toHaveTextContent('PS');
    expect(screen.queryByText('Pat Shortstop')).not.toBeInTheDocument();
    expect(screen.queryByText('Player')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(screen.getByText('Next game')).toBeInTheDocument();
    expect(screen.getByText('vs Da Beers')).toBeInTheDocument();
    expect(screen.getByText('Field 1')).toBeInTheDocument();
    expect(screen.getByText('6:00 PM')).toBeInTheDocument();
    expect(screen.queryByText('Welcome to the Oakdale Mens Softball League')).not.toBeInTheDocument();

    const checkOut = screen.getByRole('button', { name: /can't make it/i });
    expect(checkOut).toHaveTextContent('🚫');
    fireEvent.click(checkOut);
    await waitFor(() => {
      expect(checkOut).toHaveAttribute('aria-pressed', 'true');
    });

    fireEvent.click(screen.getByRole('button', { name: /open next game vs da beers/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Da Beers at Oakdale Tigers' })).toBeInTheDocument();
    });
  });

  it('lets an admin open the landing editor', async () => {
    const adminUser = {
      id: 'u-admin',
      email: 'admin@oakdale.local',
      name: 'Commish',
      role: 'admin' as const,
      teamId: null,
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/api/auth/me')) return jsonOk({ user: adminUser });
        if (url.includes('/api/theme')) return jsonOk(theme);
        if (url.includes('/api/landing') && init?.method === 'PUT') {
          const body = JSON.parse(String(init.body ?? '{}'));
          return jsonOk({ ...landing, ...body, effectiveCountdownTarget: body.countdownTarget ?? null });
        }
        if (url.includes('/api/landing')) return jsonOk(landing);
        if (url.includes('/api/standings')) return jsonOk(standings);
        if (url.includes('/api/schedule')) return jsonOk(scheduleGames);
        if (url.includes('/roster')) return jsonOk(rosterPayload);
        if (url.includes('/api/teams')) return jsonOk(teams);
        return jsonOk([]);
      }),
    );

    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Color scheme' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Headline')).toHaveValue(landing.headline);
    fireEvent.change(screen.getByLabelText('Headline'), { target: { value: 'Play ball' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(screen.getByText('Landing page saved!')).toBeInTheDocument();
    });
    expect(screen.getByText('Play ball')).toBeInTheDocument();
  });

  it('shows standings loaded from the API', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Standings' }));
    await waitFor(() => {
      expect(screen.getByText('Oakdale Tigers')).toBeInTheDocument();
    });
  });

  it('opens a schedule game on its own page', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Schedule' }));
    await waitFor(() => {
      expect(screen.getByText(/Week 1 — Wed May 6/)).toBeInTheDocument();
    });
    const open = screen.getByRole('button', { name: /open game: da beers at oakdale tigers/i });
    expect(screen.getAllByText('Upcoming').length).toBeGreaterThan(0);
    expect(screen.queryByText('Kerr Park')).not.toBeInTheDocument();

    fireEvent.click(open);
    await waitFor(() => {
      expect(screen.getByLabelText('Live box score')).toBeInTheDocument();
    });
    expect(open).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'Season Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand scoreboard' })).toBeInTheDocument();
    expect(screen.queryByText('Kerr Park')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Game details' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Da Beers at Oakdale Tigers' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Back to schedule' })).toBeInTheDocument();
    expect(screen.getByText('Kerr Park')).toBeInTheDocument();
    expect(screen.getByText('Field 1')).toBeInTheDocument();
    expect(screen.getByText('6:00 PM')).toBeInTheDocument();
    const attLines = screen.getAllByText((_, node) => node?.classList.contains('game-att-line') ?? false);
    expect(attLines[0].textContent).toMatch(/Da Beers:\s*🥎 1 · 🚫 1 · — 0/);
    expect(attLines[1].textContent).toMatch(/Oakdale Tigers:\s*🥎 0 · 🚫 0 · — 0/);
    expect(screen.getByLabelText('Live box score')).toBeInTheDocument();
    expect(screen.getByLabelText('Line score')).toBeInTheDocument();
    expect(screen.getByText('UPCOMING')).toBeInTheDocument();
    expect(screen.getAllByText('DB').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OT').length).toBeGreaterThan(0);
    for (const inning of ['1', '2', '3', '4', '5', '6', '7']) {
      expect(screen.getByRole('columnheader', { name: inning })).toBeInTheDocument();
    }
    expect(screen.getByRole('columnheader', { name: 'R' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'H' })).toBeInTheDocument();
    expect(screen.getByLabelText('0 outs')).toBeInTheDocument();
    expect(screen.getByLabelText('Batter up #1 Pat Lead')).toBeInTheDocument();
    expect(screen.getByLabelText('On deck #2 Chris Deck')).toBeInTheDocument();
    expect(screen.getByText(/Top 1 · Da Beers/)).toBeInTheDocument();
    expect(screen.getByLabelText('Da Beers lineup')).toBeInTheDocument();
    expect(screen.getByLabelText('Oakdale Tigers lineup')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start live scorekeeping/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to schedule' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Season Schedule' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Da Beers at Oakdale Tigers' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open game: da beers at oakdale tigers/i })).toBeInTheDocument();
  });

  it('opens a deep-linked game page from /games/:id', async () => {
    window.history.replaceState({}, '', '/games/g1');
    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Da Beers at Oakdale Tigers' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Back to schedule' })).toBeInTheDocument();
    expect(screen.getByLabelText('Live box score')).toBeInTheDocument();
  });

  it('lets a manager start live scorekeeping and bump runs', async () => {
    const managerUser = {
      id: 'u-mgr',
      email: 'manager@oakdale.local',
      name: 'David',
      role: 'manager' as const,
      teamId: 'tigers',
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    const liveGame = {
      ...scheduleGames[0],
      scoring: { ...scheduleGames[0].scoring!, canStart: true, canScore: false },
    };
    const startedGame = {
      ...liveGame,
      scoring: {
        ...liveGame.scoring,
        phase: 'live' as const,
        open: true,
        liveStartedAt: '2026-09-26T19:00:00.000Z',
        canStart: false,
        canScore: true,
      },
    };
    const scoredGame = {
      ...startedGame,
      played: true,
      homeScore: 1,
      box: {
        ...startedGame.box!,
        homeRuns: 1,
        homeLine: [1, 0, 0, 0, 0, 0, 0],
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/api/auth/me')) return jsonOk({ user: managerUser });
        if (url.includes('/api/theme')) return jsonOk(theme);
        if (url.includes('/api/landing')) return jsonOk(landing);
        if (url.includes('/api/standings')) return jsonOk(standings);
        if (url.includes('/scorelog/start') && init?.method === 'POST') return jsonOk(startedGame);
        if (url.includes('/scorelog/inning') && init?.method === 'POST') return jsonOk(scoredGame);
        if (url.includes('/scorelog/stat') && init?.method === 'POST') return jsonOk(scoredGame);
        if (url.includes('/api/games/') && !url.includes('/scorelog') && !url.includes('/lineups')) return jsonOk(liveGame);
        if (url.includes('/api/schedule')) return jsonOk([liveGame]);
        if (url.includes('/api/teams')) return jsonOk(teams);
        if (url.includes('/roster')) return jsonOk(rosterPayload);
        if (url.includes('/messages')) return jsonOk([]);
        return jsonOk([]);
      }),
    );

    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Schedule' }));
    await waitFor(() => {
      expect(screen.getByText(/Week 1 — Wed May 6/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /open game: da beers at oakdale tigers/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start live scorekeeping/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /start live scorekeeping/i }));
    await waitFor(() => {
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Increase Oakdale Tigers R' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Increase Oakdale Tigers H' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Increase Oakdale Tigers inning/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Increase Oakdale Tigers R' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Live box score')).toHaveTextContent(/0\s*LIVE\s*1/);
    });
    expect(screen.getByRole('button', { name: 'Record Single' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record Double' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record Triple' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record HR' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record Out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record K' })).toBeInTheDocument();
  });

  it('records a play, appends it to the log, and shows lineup stat lines', async () => {
    const managerUser = {
      id: 'u-mgr',
      email: 'manager@oakdale.local',
      name: 'David',
      role: 'manager' as const,
      teamId: 'tigers',
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    const liveGame = {
      ...scheduleGames[0],
      scoring: {
        ...scheduleGames[0].scoring!,
        phase: 'live' as const,
        open: true,
        liveStartedAt: '2026-09-26T19:00:00.000Z',
        canStart: false,
        canScore: true,
      },
    };
    const afterSingle = {
      ...liveGame,
      box: { ...liveGame.box!, awayHits: 1 },
      plays: [
        {
          id: 1,
          playerId: 'u-pat',
          name: 'Pat Lead',
          result: 'single' as const,
          side: 'away' as const,
          inning: 1,
          half: 'top' as const,
          createdAt: '2026-09-26T19:01:00.000Z',
        },
      ],
      lineups: {
        ...liveGame.lineups!,
        away: {
          ...liveGame.lineups!.away,
          atBat: liveGame.lineups!.away.slots[1],
          onDeck: liveGame.lineups!.away.slots[0],
          slots: [
            {
              ...liveGame.lineups!.away.slots[0],
              stats: { gamesPlayed: 1, hits: 2, atBats: 3, average: '.667', singles: 2, doubles: 0, triples: 0, homers: 0, strikeouts: 0, outs: 1 },
            },
            liveGame.lineups!.away.slots[1],
          ],
        },
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/api/auth/me')) return jsonOk({ user: managerUser });
        if (url.includes('/api/theme')) return jsonOk(theme);
        if (url.includes('/api/landing')) return jsonOk(landing);
        if (url.includes('/api/standings')) return jsonOk(standings);
        if (url.includes('/scorelog/play') && init?.method === 'POST') return jsonOk(afterSingle);
        if (url.includes('/api/games/') && !url.includes('/scorelog') && !url.includes('/lineups')) return jsonOk(liveGame);
        if (url.includes('/api/schedule')) return jsonOk([liveGame]);
        if (url.includes('/api/teams')) return jsonOk(teams);
        if (url.includes('/roster')) return jsonOk(rosterPayload);
        if (url.includes('/messages')) return jsonOk([]);
        return jsonOk([]);
      }),
    );

    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Schedule' }));
    await waitFor(() => {
      expect(screen.getByText(/Week 1 — Wed May 6/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole('button', { name: /open game: da beers at oakdale tigers/i })[0]);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Game details' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Game details' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Record Single' })).toBeInTheDocument();
    });
    expect(screen.getByText('No plays yet. Tap a result to add it to the log.')).toBeInTheDocument();
    expect(screen.getAllByText('GP 1 · H 1 · AB 2 · .500').length).toBeGreaterThan(0);
    expect(screen.getByText('1B 1 · 2B 0 · 3B 0 · HR 0 · K 0 · Out 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record Single' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Play by play')).toHaveTextContent('Pat Lead');
    });
    expect(screen.getByLabelText('Play by play')).toHaveTextContent('Single');
    expect(screen.getByLabelText('Play by play')).toHaveTextContent('Top 1');
    expect(screen.getByText('GP 1 · H 2 · AB 3 · .667')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo last play' })).toBeEnabled();
  });

  it('lets a manager reorder and save their lineup', async () => {
    const managerUser = {
      id: 'u-mgr',
      email: 'manager@oakdale.local',
      name: 'David',
      role: 'manager' as const,
      teamId: 'tigers',
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    const editable = {
      ...scheduleGames[0],
      lineups: {
        away: scheduleGames[0].lineups!.away,
        home: {
          ...scheduleGames[0].lineups!.home,
          slots: [
            { id: 'u-david', name: 'David', number: 11 },
            { id: 'u-pat', name: 'Pat Shortstop', number: 12 },
          ],
          canEdit: true,
        },
      },
    };
    const saved = {
      ...editable,
      lineups: {
        ...editable.lineups,
        home: { ...editable.lineups.home, saved: true },
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/api/auth/me')) return jsonOk({ user: managerUser });
        if (url.includes('/api/theme')) return jsonOk(theme);
        if (url.includes('/api/landing')) return jsonOk(landing);
        if (url.includes('/api/standings')) return jsonOk(standings);
        if (url.includes('/lineups/') && init?.method === 'PUT') return jsonOk(saved);
        if (url.includes('/api/games/') && !url.includes('/scorelog') && !url.includes('/lineups')) return jsonOk(editable);
        if (url.includes('/api/schedule')) return jsonOk([editable]);
        if (url.includes('/api/teams')) return jsonOk(teams);
        if (url.includes('/roster')) return jsonOk(rosterPayload);
        if (url.includes('/messages')) return jsonOk([]);
        return jsonOk([]);
      }),
    );

    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Schedule' }));
    await waitFor(() => {
      expect(screen.getByText(/Week 1 — Wed May 6/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /open game: da beers at oakdale tigers/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Game details' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Game details' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save Oakdale Tigers lineup' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Move David down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Oakdale Tigers lineup' }));
    await waitFor(() => {
      expect(screen.getByText('Saved Oakdale Tigers lineup.')).toBeInTheDocument();
    });
  });

  it('shows compact per-team attendance chips on collapsed schedule rows', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Schedule' }));
    await waitFor(() => {
      expect(screen.getByText(/Week 1 — Wed May 6/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText('1 of 2 checked in')).toHaveTextContent('🥎 1/2');
    expect(screen.getByLabelText('No roster accounts')).toHaveTextContent('—');
    expect(screen.queryByLabelText('Live games')).not.toBeInTheDocument();
  });

  it('pins live games at the top of the schedule', async () => {
    const liveGame = {
      ...scheduleGames[0],
      scoring: {
        ...scheduleGames[0].scoring!,
        phase: 'live' as const,
        open: true,
        liveStartedAt: '2026-05-06T18:05:00.000Z',
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/auth/me')) return jsonOk({ user: null });
        if (url.includes('/api/theme')) return jsonOk(theme);
        if (url.includes('/api/landing')) return jsonOk(landing);
        if (url.includes('/api/standings')) return jsonOk(standings);
        if (url.includes('/api/schedule')) return jsonOk([liveGame]);
        if (url.includes('/api/games/') && !url.includes('/scorelog') && !url.includes('/lineups')) {
          return jsonOk(liveGame);
        }
        if (url.includes('/api/teams')) return jsonOk(teams);
        if (url.includes('/roster')) return jsonOk(rosterPayload);
        if (url.includes('/messages')) return jsonOk([]);
        return jsonOk([]);
      }),
    );

    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Schedule' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Live games')).toBeInTheDocument();
    });
    expect(screen.getByText('Live now')).toBeInTheDocument();
    expect(screen.getAllByText(/LIVE/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: /open game: da beers at oakdale tigers/i })[0]);
    await waitFor(() => {
      expect(screen.getByLabelText('Live box score')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Game details' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Da Beers at Oakdale Tigers' })).toBeInTheDocument();
    });
  });

  it('expands the live game log under a schedule row', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Schedule' }));
    await waitFor(() => {
      expect(screen.getByText(/Week 1 — Wed May 6/)).toBeInTheDocument();
    });
    const open = screen.getByRole('button', { name: /open game: da beers at oakdale tigers/i });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(open);
    await waitFor(() => {
      expect(screen.getByLabelText('Live box score')).toBeInTheDocument();
    });
    expect(open).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'Season Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand scoreboard' })).toBeInTheDocument();
    fireEvent.click(open);
    expect(open).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Live box score')).not.toBeInTheDocument();
  });

  it('opens a dugout fullscreen scoreboard for live scoring and exits it', async () => {
    const managerUser = {
      id: 'u-mgr',
      email: 'manager@oakdale.local',
      name: 'David',
      role: 'manager' as const,
      teamId: 'tigers',
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    const liveGame = {
      ...scheduleGames[0],
      scoring: {
        ...scheduleGames[0].scoring!,
        phase: 'live' as const,
        open: true,
        liveStartedAt: '2026-09-26T19:00:00.000Z',
        canStart: false,
        canScore: true,
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/auth/me')) return jsonOk({ user: managerUser });
        if (url.includes('/api/theme')) return jsonOk(theme);
        if (url.includes('/api/landing')) return jsonOk(landing);
        if (url.includes('/api/standings')) return jsonOk(standings);
        if (url.includes('/api/games/') && !url.includes('/scorelog') && !url.includes('/lineups')) return jsonOk(liveGame);
        if (url.includes('/api/schedule')) return jsonOk([liveGame]);
        if (url.includes('/api/teams')) return jsonOk(teams);
        if (url.includes('/roster')) return jsonOk(rosterPayload);
        if (url.includes('/messages')) return jsonOk([]);
        return jsonOk([]);
      }),
    );

    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Schedule' }));
    await waitFor(() => {
      expect(screen.getByText(/Week 1 — Wed May 6/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole('button', { name: /open game: da beers at oakdale tigers/i })[0]);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Expand dugout scoreboard' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Record Single' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand dugout scoreboard' }));
    expect(screen.getByRole('dialog', { name: 'Dugout scoreboard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit dugout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record HR' })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Exit dugout' }));
    expect(screen.queryByRole('dialog', { name: 'Dugout scoreboard' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand dugout scoreboard' })).toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('lists teams with live lineup status and opens a team roster', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Teams' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open Oakdale Tigers' })).toBeInTheDocument();
    });
    expect(screen.getByText('Need guys')).toBeInTheDocument();
    expect(screen.getByText('1/10 in')).toBeInTheDocument();
    expect(screen.getByText('3/15 roster')).toBeInTheDocument();
    expect(screen.getByText('3/15 spots')).toBeInTheDocument();
    expect(screen.getByText(/vs Da Beers · Field 1 · 6:00 PM/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Free agency' })).toBeInTheDocument();
    expect(screen.getByText('Free Agent Joe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign up as a free agent/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /sign up as a free agent/i }));
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: 'Open Oakdale Tigers' }));
    await waitFor(() => {
      expect(screen.getByText('Pat Shortstop')).toBeInTheDocument();
    });
    expect(screen.getByText('Roster · 3/15')).toBeInTheDocument();
    expect(screen.getByText('Placeholder Guy')).toBeInTheDocument();
    expect(screen.getByText(/#9 · OF · Unregistered/)).toBeInTheDocument();
    expect(screen.getAllByText('Open spot').length).toBe(12);
    expect(screen.getByText('#12 · SS')).toBeInTheDocument();
    expect(screen.getAllByText(/Managers · 1\/2/).length).toBeGreaterThan(0);
    expect(screen.getByText('Open manager spot')).toBeInTheDocument();
    expect(screen.getAllByText('Manager').length).toBeGreaterThan(0);
    expect(screen.getByText(/Check-in — Week 1 · Wed May 6/)).toBeInTheDocument();
    expect(screen.getByText(/🥎 1 · 🚫 0 · — 1/)).toBeInTheDocument();
    expect(screen.getByLabelText('Coach is in')).toHaveTextContent('🥎');
    expect(screen.getByLabelText("Pat Shortstop hasn't checked in")).toHaveTextContent('—');
    expect(screen.queryByRole('button', { name: /i'm there/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save name/i })).not.toBeInTheDocument();
  });

  it('opens a player profile with a stat line from the free-agent list', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Teams' }));
    await waitFor(() => {
      expect(screen.getByText('Free Agent Joe')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Free Agent Joe'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Free Agent Joe' })).toBeInTheDocument();
    });
    expect(screen.getByText('#7')).toBeInTheDocument();
    expect(screen.getByText(/OF · Regular/)).toBeInTheDocument();
    expect(screen.getByText('GP')).toBeInTheDocument();
    expect(screen.getByText('Hits')).toBeInTheDocument();
    expect(screen.getByText('AB')).toBeInTheDocument();
    expect(screen.getByText('AVG')).toBeInTheDocument();
    expect(screen.getByText('.417')).toBeInTheDocument();
    expect(screen.getByText('Phone is hidden unless this player shares it with managers.')).toBeInTheDocument();
  });

  it('hides free-agent signup after playoffs begin and opens register from the CTA', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/auth/me')) return jsonOk({ user: null });
        if (url.includes('/api/theme')) return jsonOk(theme);
        if (url.includes('/api/landing')) return jsonOk(landing);
        if (url.includes('/api/standings')) return jsonOk(standings);
        if (url.includes('/api/schedule')) return jsonOk(scheduleGames);
        if (url.includes('/api/team-board')) {
          return jsonOk({
            ...teamBoard,
            freeAgencyOpen: false,
            freeAgents: [],
            teams: [
              {
                ...teamBoard.teams[0],
                checkedInCount: 10,
                lineupStatus: 'full_lineup' as const,
              },
            ],
          });
        }
        if (url.includes('/roster')) return jsonOk({ ...rosterPayload, freeAgencyOpen: false });
        if (url.includes('/api/teams')) return jsonOk(teams);
        return jsonOk([]);
      }),
    );

    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Teams' }));
    await waitFor(() => {
      expect(screen.getByText('Full lineup')).toBeInTheDocument();
    });
    expect(screen.getByText(/Free agency closed — playoffs have started/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign up as a free agent/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Free Agent Joe')).not.toBeInTheDocument();
  });

  it('shows a public suggestions box and hides the team-chat button when logged out', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Suggestions' })).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Suggestion')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /team chat/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Suggestion'), {
      target: { value: 'Add a snack schedule' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(screen.getByText('Thanks for the suggestion!')).toBeInTheDocument();
    });
    expect(screen.queryByText('Add a snack schedule')).not.toBeInTheDocument();
  });

  it('opens team chat from the app-bar button for a signed-in teammate', async () => {
    const playerUser = {
      id: 'u1',
      email: 'pat@example.com',
      name: 'Pat Shortstop',
      role: 'player' as const,
      teamId: 'tigers',
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    const chat: Array<{ id: string; teamId: string; userId: string; authorName: string; text: string; createdAt: string }> = [
      {
        id: 'm1',
        teamId: 'tigers',
        userId: 'u-mgr',
        authorName: 'Coach',
        text: 'Bring water',
        createdAt: new Date().toISOString(),
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/api/auth/me')) return jsonOk({ user: playerUser });
        if (url.includes('/api/theme')) return jsonOk(theme);
        if (url.includes('/api/landing')) return jsonOk(landing);
        if (url.includes('/api/standings')) return jsonOk(standings);
        if (url.includes('/api/schedule')) return jsonOk(scheduleGames);
        if (url.includes('/messages')) {
          if (init?.method === 'POST') {
            const body = JSON.parse(String(init.body ?? '{}')) as { text: string };
            const posted = {
              id: 'm2',
              teamId: 'tigers',
              userId: playerUser.id,
              authorName: playerUser.name,
              text: body.text,
              createdAt: new Date().toISOString(),
            };
            chat.push(posted);
            return jsonOk(posted);
          }
          return jsonOk([...chat]);
        }
        if (url.includes('/api/suggestions')) return jsonOk([]);
        if (url.includes('/api/team-board')) return jsonOk(teamBoard);
        if (url.includes('/roster')) return jsonOk(rosterPayload);
        if (url.includes('/api/teams')) return jsonOk(teams);
        return jsonOk([]);
      }),
    );

    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /team chat/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /team chat/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /team chat/i })).toBeInTheDocument();
    });
    expect(screen.getAllByText('Oakdale Tigers').length).toBeGreaterThan(0);
    expect(screen.getByText('Bring water')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'On my way' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(screen.getByText('On my way')).toBeInTheDocument();
    });
  });

  it('lets a signed-in teammate set, highlight, and clear a weekly check-in', async () => {
    const playerUser = {
      id: 'u1',
      email: 'pat@example.com',
      name: 'Pat Shortstop',
      role: 'player' as const,
      teamId: 'tigers',
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    let patCheckIn: 'in' | 'out' | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/api/auth/me')) {
          return { ok: true, json: async () => ({ user: playerUser }) } as Response;
        }
        if (url.includes('/api/theme')) return jsonOk(theme);
        if (url.includes('/api/landing')) {
          return { ok: true, json: async () => landing } as Response;
        }
        if (url.includes('/api/standings')) {
          return { ok: true, json: async () => standings } as Response;
        }
        if (url.includes('/api/schedule')) {
          return { ok: true, json: async () => scheduleGames } as Response;
        }
        if (url.includes('/api/checkin')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as { week: number; status: 'in' | 'out' | null };
          patCheckIn = body.status;
          return { ok: true, json: async () => ({ ok: true, week: body.week, status: body.status }) } as Response;
        }
        if (url.includes('/api/team-board')) return jsonOk(teamBoard);
        if (url.includes('/roster')) {
          return {
            ok: true,
            json: async () => ({
              ...rosterPayload,
              members: rosterPayload.members.map((m) =>
                m.id === 'u1' ? { ...m, checkIn: patCheckIn } : m,
              ),
            }),
          } as Response;
        }
        if (url.includes('/api/teams')) {
          return { ok: true, json: async () => teams } as Response;
        }
        return { ok: true, json: async () => [] } as Response;
      }),
    );

    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Teams' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open Oakdale Tigers' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Oakdale Tigers' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /i'm there/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /can't make it/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /i'm there/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('Pat Shortstop is in')).toHaveTextContent('🥎');
    });
    expect(screen.getByRole('button', { name: /i'm there/i })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /i'm there/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("Pat Shortstop hasn't checked in")).toHaveTextContent('—');
    });
    expect(screen.getByRole('button', { name: /i'm there/i })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: /can't make it/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("Pat Shortstop can't make it")).toHaveTextContent('🚫');
    });
    expect(screen.getByRole('button', { name: /can't make it/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows a live countdown to the effective opening-day target', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/auth/me')) return jsonOk({ user: null });
        if (url.includes('/api/theme')) return jsonOk(theme);
        if (url.includes('/api/landing')) {
          return jsonOk({
            ...landing,
            countdownLabel: 'Opening Day',
            countdownTarget: '2099-05-06T18:00:00',
            effectiveCountdownTarget: '2099-05-06T18:00:00',
          });
        }
        if (url.includes('/api/standings')) return jsonOk(standings);
        if (url.includes('/api/schedule')) return jsonOk(scheduleGames);
        if (url.includes('/roster')) return jsonOk(rosterPayload);
        if (url.includes('/api/teams')) return jsonOk(teams);
        return jsonOk([]);
      }),
    );

    renderApp();
    await waitFor(() => {
      expect(screen.getByText(/Opening Day in \d+d \d+h \d+m \d{2}s/)).toBeInTheDocument();
    });
  });

  it('shows that the season is underway when the countdown target is in the past', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/auth/me')) return jsonOk({ user: null });
        if (url.includes('/api/theme')) return jsonOk(theme);
        if (url.includes('/api/landing')) {
          return jsonOk({
            ...landing,
            countdownTarget: '2020-04-01T18:00:00',
            effectiveCountdownTarget: '2020-04-01T18:00:00',
          });
        }
        if (url.includes('/api/standings')) return jsonOk(standings);
        if (url.includes('/api/schedule')) return jsonOk(scheduleGames);
        if (url.includes('/roster')) return jsonOk(rosterPayload);
        if (url.includes('/api/teams')) return jsonOk(teams);
        return jsonOk([]);
      }),
    );

    renderApp();
    await waitFor(() => {
      expect(screen.getByText('The season is underway!')).toBeInTheDocument();
    });
  });

  it('lets an admin generate and clear test data from the Admin tab after confirming', async () => {
    const adminUser = {
      id: 'u-admin',
      email: 'admin@oakdale.local',
      name: 'Commish',
      role: 'admin' as const,
      teamId: null,
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/api/auth/me')) return jsonOk({ user: adminUser });
        if (url.includes('/api/theme')) return jsonOk(theme);
        if (url.includes('/api/landing')) return jsonOk(landing);
        if (url.includes('/api/standings')) return jsonOk(standings);
        if (url.includes('/api/schedule')) return jsonOk(scheduleGames);
        if (url.includes('/api/admin/test-data/generate') && init?.method === 'POST') {
          return jsonOk({
            guestsCreated: 127,
            rosteredPlayers: 119,
            freeAgents: 8,
            checkIns: 1309,
            messages: 40,
            gamesPlayed: 44,
            invites: 8,
          });
        }
        if (url.includes('/api/admin/test-data/clear') && init?.method === 'POST') {
          return jsonOk({ guestsRemoved: 127, checkInsRemoved: 1309, messagesRemoved: 40, gamesReset: 44 });
        }
        if (url.includes('/api/suggestions')) return jsonOk([]);
        if (url.includes('/api/manager-emails')) return jsonOk([]);
        if (url.includes('/api/users')) return jsonOk([adminUser]);
        if (url.includes('/roster')) return jsonOk(rosterPayload);
        if (url.includes('/api/teams')) return jsonOk(teams);
        return jsonOk([]);
      }),
    );

    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Admin' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Admin' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Data (simulation)' })).toBeInTheDocument();
    });
    expect(screen.getByText(/for testing only/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Generate test data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm generate' }));
    await waitFor(() => {
      expect(
        screen.getByText('Created 127 guests, 1309 check-ins, 40 messages, 44 games scored'),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear test data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm clear' }));
    await waitFor(() => {
      expect(screen.getByText('Removed 127 guests, reset 44 games')).toBeInTheDocument();
    });
  });

  it('lets an admin preview, sync, and download team-categorized player stats', async () => {
    const adminUser = {
      id: 'u-admin',
      email: 'admin@oakdale.local',
      name: 'Commish',
      role: 'admin' as const,
      teamId: null,
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    const sheetStatus = {
      spreadsheetId: '1LwMlsDCZBEqCQqb2qW0lhpTlWNNa-OpcGOPQnbqj1wc',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1LwMlsDCZBEqCQqb2qW0lhpTlWNNa-OpcGOPQnbqj1wc/edit',
      tab: 'Player Stats',
      configured: false,
      lastSyncAt: null,
      lastSyncStatus: null,
      lastSyncError: null,
      lastSyncPlayerCount: null,
      teamCount: 8,
      playerCount: 3,
      freeAgentCount: 1,
    };
    const createObjectURL = vi.fn(() => 'blob:player-stats');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/api/auth/me')) return jsonOk({ user: adminUser });
        if (url.includes('/api/theme')) return jsonOk(theme);
        if (url.includes('/api/landing')) return jsonOk(landing);
        if (url.includes('/api/admin/player-stats-sheet/sync') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body ?? '{}')) as { dryRun?: boolean };
          return jsonOk({
            ...sheetStatus,
            ok: true,
            dryRun: body.dryRun === true,
            wrote: false,
            updatedAt: '2026-09-27T04:00:00.000Z',
            sections: [],
            values: [],
          });
        }
        if (url.includes('/api/admin/player-stats-sheet.csv')) {
          return {
            ok: true,
            blob: async () => new Blob(['Player,GP\nPat,1\n'], { type: 'text/csv' }),
          } as Response;
        }
        if (url.includes('/api/admin/player-stats-sheet')) return jsonOk(sheetStatus);
        if (url.includes('/api/suggestions')) return jsonOk([]);
        if (url.includes('/api/manager-emails')) return jsonOk([]);
        if (url.includes('/api/users')) return jsonOk([adminUser]);
        if (url.includes('/api/teams')) return jsonOk(teams);
        return jsonOk([]);
      }),
    );

    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Admin' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Admin' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Player stats Google Sheet' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Open the sheet' })).toHaveAttribute(
      'href',
      sheetStatus.spreadsheetUrl,
    );
    expect(screen.getByText(/3 players across 8 teams/)).toBeInTheDocument();
    expect(screen.getByText(/Each team gets 15 roster spots/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Preview rows' }));
    await waitFor(() => {
      expect(screen.getByText(/Preview ready \(3 players\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Update Google Sheet' }));
    await waitFor(() => {
      expect(screen.getByText(/Google credentials are not on this host/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() => {
      expect(screen.getByText(/Downloaded oakdale-player-stats.csv/)).toBeInTheDocument();
    });
    expect(createObjectURL).toHaveBeenCalled();
  });

  it('lets an admin switch the league color scheme from the Admin tab', async () => {
    const adminUser = {
      id: 'u-admin',
      email: 'admin@oakdale.local',
      name: 'Commish',
      role: 'admin' as const,
      teamId: null,
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    const liberty = {
      ...theme,
      id: 'liberty' as const,
      label: 'Navy and gold',
      primary: '#1d3557',
      accent: '#f2a900',
      navy: '#1d3557',
      navyLight: '#27436b',
      accentDark: '#d99400',
      heading: '#1d3557',
      onAccent: '#1d3557',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/api/auth/me')) return jsonOk({ user: adminUser });
        if (url.includes('/api/theme') && init?.method === 'PUT') {
          const body = JSON.parse(String(init.body ?? '{}')) as { id?: string };
          return jsonOk(body.id === 'liberty' ? liberty : theme);
        }
        if (url.includes('/api/theme')) return jsonOk(theme);
        if (url.includes('/api/landing')) return jsonOk(landing);
        if (url.includes('/api/standings')) return jsonOk(standings);
        if (url.includes('/api/schedule')) return jsonOk(scheduleGames);
        if (url.includes('/api/suggestions')) return jsonOk([]);
        if (url.includes('/api/manager-emails')) return jsonOk([]);
        if (url.includes('/api/users')) return jsonOk([adminUser]);
        if (url.includes('/roster')) return jsonOk(rosterPayload);
        if (url.includes('/api/teams')) return jsonOk(teams);
        return jsonOk([]);
      }),
    );

    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Admin' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Admin' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Color scheme' })).toBeInTheDocument();
    });
    expect(screen.getByText(/everyone in the league sees the scheme you save/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /navy and gold/i }));
    await waitFor(() => {
      expect(screen.getByText('Color scheme saved: Navy and gold.')).toBeInTheDocument();
    });
    expect(document.documentElement.style.getPropertyValue('--navy')).toBe('#1d3557');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#f2a900');
  });

  it('tells admins that playing managers stay on the team they manage', async () => {
    const adminUser = {
      id: 'u-admin',
      email: 'admin@oakdale.local',
      name: 'Commish',
      role: 'admin' as const,
      teamId: null,
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    const managerUser = {
      id: 'u-mgr',
      email: 'manager@oakdale.local',
      name: 'David',
      role: 'manager' as const,
      teamId: 'tigers',
      onRoster: true,
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    const playerUser = {
      id: 'u-player',
      email: 'pat@oakdale.local',
      name: 'Pat',
      role: 'player' as const,
      teamId: 'beers',
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    const adminTeams = [
      { id: 'tigers', name: 'Oakdale Tigers' },
      { id: 'beers', name: 'Cold Beers' },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/auth/me')) return jsonOk({ user: adminUser });
        if (url.includes('/api/theme')) return jsonOk(theme);
        if (url.includes('/api/landing')) return jsonOk(landing);
        if (url.includes('/api/standings')) return jsonOk(standings);
        if (url.includes('/api/schedule')) return jsonOk(scheduleGames);
        if (url.includes('/api/suggestions')) return jsonOk([]);
        if (url.includes('/api/manager-emails')) return jsonOk([]);
        if (url.includes('/api/users')) return jsonOk([adminUser, managerUser, playerUser]);
        if (url.includes('/roster')) return jsonOk(rosterPayload);
        if (url.includes('/api/teams')) return jsonOk(adminTeams);
        return jsonOk([]);
      }),
    );

    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Admin' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Admin' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Promote players to manager' })).toBeInTheDocument();
    });
    const teamSelect = screen.getByLabelText('Team with an open manager spot');
    expect(teamSelect).toHaveTextContent(/Cold Beers/);
    expect(teamSelect).toHaveTextContent(/Oakdale Tigers/);
    expect(screen.getByLabelText('Player to promote')).toHaveDisplayValue(/Pat/);
    expect(screen.getByLabelText('Manager roster option')).toHaveDisplayValue('Yes — for this team');
    expect(
      screen.getByText(/each team has 2 manager spots/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Manager type for David')).toHaveDisplayValue('Plays for this team');
    expect(screen.getByLabelText('Role for Pat')).not.toHaveTextContent('Admin');
    expect(screen.getByLabelText('Role for David')).not.toHaveTextContent('Admin');
    expect(screen.getByLabelText('Role for Commish')).toHaveDisplayValue('Admin');
    expect(screen.getByLabelText('Role for Commish')).toBeDisabled();
    expect(screen.getByText(/there is one league admin/i)).toBeInTheDocument();
  });

  it('hides the promote form when every team already has two managers', async () => {
    const adminUser = {
      id: 'u-admin',
      email: 'admin@oakdale.local',
      name: 'Commish',
      role: 'admin' as const,
      teamId: null,
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    const managerUser = {
      id: 'u-mgr',
      email: 'manager@oakdale.local',
      name: 'David',
      role: 'manager' as const,
      teamId: 'tigers',
      onRoster: true,
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    const backupUser = {
      id: 'u-mgr-2',
      email: 'backup@oakdale.local',
      name: 'Backup',
      role: 'manager' as const,
      teamId: 'tigers',
      onRoster: true,
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/auth/me')) return jsonOk({ user: adminUser });
        if (url.includes('/api/theme')) return jsonOk(theme);
        if (url.includes('/api/landing')) return jsonOk(landing);
        if (url.includes('/api/standings')) return jsonOk(standings);
        if (url.includes('/api/schedule')) return jsonOk(scheduleGames);
        if (url.includes('/api/suggestions')) return jsonOk([]);
        if (url.includes('/api/manager-emails')) return jsonOk([]);
        if (url.includes('/api/users')) return jsonOk([adminUser, managerUser, backupUser]);
        if (url.includes('/roster')) return jsonOk(rosterPayload);
        if (url.includes('/api/teams')) return jsonOk(teams);
        return jsonOk([]);
      }),
    );

    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Admin' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Admin' }));
    await waitFor(() => {
      expect(screen.getByText('Every team already has 2 managers.')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Team with an open manager spot')).not.toBeInTheDocument();
  });

  it('lets a manager choose whether they play for their own team, without a second team picker', async () => {
    const managerUser = {
      id: 'u-mgr',
      email: 'manager@oakdale.local',
      name: 'David',
      role: 'manager' as const,
      teamId: 'tigers',
      onRoster: true,
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/auth/me')) return jsonOk({ user: managerUser });
        if (url.includes('/api/theme')) return jsonOk(theme);
        if (url.includes('/api/landing')) return jsonOk(landing);
        if (url.includes('/api/standings')) return jsonOk(standings);
        if (url.includes('/api/schedule')) return jsonOk(scheduleGames);
        if (url.includes('/messages')) return jsonOk([]);
        if (url.includes('/api/suggestions')) return jsonOk([]);
        if (url.includes('/api/team-board')) return jsonOk(teamBoard);
        if (url.includes('/roster')) return jsonOk(rosterPayload);
        if (url.includes('/api/teams')) return jsonOk(teams);
        if (url.includes('/api/members')) return jsonOk([]);
        return jsonOk([]);
      }),
    );

    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit profile' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Edit profile' })).toHaveTextContent('DA');
    expect(screen.queryByText('Team Manager')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    expect(screen.getByText('I play for the team I manage')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByLabelText('Manager roster option')).toHaveDisplayValue("Yes — on my team's roster");
    expect(screen.queryByLabelText('Join a team')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Change team')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Teams' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open Oakdale Tigers' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Oakdale Tigers' }));
    await waitFor(() => {
      expect(screen.getByText('Pat Shortstop')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Save name' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Join a team')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Change team')).not.toBeInTheDocument();
  });

  it('shows a profile photo thumbnail in the header when one is uploaded', async () => {
    const photoUrl = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    const playerUser = {
      id: 'u1',
      email: 'pat@example.com',
      name: 'Pat Shortstop',
      role: 'player' as const,
      teamId: 'tigers',
      photoUrl,
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/auth/me')) return jsonOk({ user: playerUser });
        if (url.includes('/api/theme')) return jsonOk(theme);
        if (url.includes('/api/landing')) return jsonOk(landing);
        if (url.includes('/api/standings')) return jsonOk(standings);
        if (url.includes('/api/schedule')) return jsonOk(scheduleGames);
        if (url.includes('/roster')) return jsonOk(rosterPayload);
        if (url.includes('/api/teams')) return jsonOk(teams);
        return jsonOk([]);
      }),
    );

    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit profile' })).toBeInTheDocument();
    });
    const header = screen.getByRole('button', { name: 'Edit profile' });
    expect(header.querySelector('img')).toHaveAttribute('src', photoUrl);
    expect(header).not.toHaveTextContent('PS');
    fireEvent.click(header);
    expect(screen.getByRole('heading', { name: 'Your profile' })).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
    expect(screen.getByLabelText('Let managers see my number')).toBeInTheDocument();
    expect(screen.getByText(/Off by default. Managers use this to reach you about a game./)).toBeInTheDocument();
    expect(screen.getByLabelText('Skill level')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload signed waiver')).toBeInTheDocument();
  });

  it('lets an admin send a signup-email test when mail is configured', async () => {
    const adminUser = {
      id: 'u-admin',
      email: 'admin@oakdale.local',
      name: 'Commish',
      role: 'admin' as const,
      teamId: null,
      createdAt: '2026-04-01T00:00:00.000Z',
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/auth/me')) return jsonOk({ user: adminUser });
      if (url.includes('/api/theme')) return jsonOk(theme);
      if (url.includes('/api/landing')) return jsonOk(landing);
      if (url.includes('/api/standings')) return jsonOk(standings);
      if (url.includes('/api/schedule')) return jsonOk(scheduleGames);
      if (url.includes('/api/suggestions')) return jsonOk([]);
      if (url.includes('/api/manager-emails')) return jsonOk([]);
      if (url.includes('/api/users')) return jsonOk([adminUser]);
      if (url.includes('/roster')) return jsonOk(rosterPayload);
      if (url.includes('/api/teams')) return jsonOk(teams);
      if (url.includes('/api/mail/test') && init?.method === 'POST') {
        return jsonOk({ ok: true, to: 'david@example.com' });
      }
      if (url.includes('/api/mail')) {
        return jsonOk({
          configured: true,
          transport: 'resend',
          from: 'League <noreply@test.dev>',
          notifyEmails: ['david@example.com'],
          publicAppUrl: 'https://oakdale-mens-softball.fly.dev',
        });
      }
      return jsonOk([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Admin' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Admin' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Signup emails' })).toBeInTheDocument();
    });
    expect(screen.getByText(/on via resend/i)).toBeInTheDocument();
    expect(screen.getByText(/david@example.com/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send test email' }));
    await waitFor(() => {
      expect(screen.getByText('Test email sent to david@example.com.')).toBeInTheDocument();
    });
  });
});
