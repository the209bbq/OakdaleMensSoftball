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
          { id: 'u-pat', name: 'Pat Lead', number: 1 },
          { id: 'u-chris', name: 'Chris Deck', number: 2 },
        ],
        atBat: { id: 'u-pat', name: 'Pat Lead', number: 1 },
        onDeck: { id: 'u-chris', name: 'Chris Deck', number: 2 },
        canEdit: false,
        locksAt: '2026-05-05T18:00:00.000Z',
        saved: true,
      },
      home: {
        teamId: 'tigers',
        slots: [{ id: 'u-david', name: 'David', number: 11 }],
        atBat: { id: 'u-david', name: 'David', number: 11 },
        onDeck: { id: 'u-david', name: 'David', number: 11 },
        canEdit: false,
        locksAt: '2026-05-05T18:00:00.000Z',
        saved: true,
      },
    },
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
    { id: 'liberty' as const, label: 'Red, white & blue', blurb: 'Navy, clean white, and a quiet crimson', primary: '#1d3557', accent: '#e63946' },
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
  currentWeek: { week: 1, date: '2026-05-06' },
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
      if (url.includes('/roster')) return jsonOk(rosterPayload);
      if (url.includes('/api/teams')) return jsonOk(teams);
      return jsonOk([]);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
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
    expect(screen.getByRole('tab', { name: 'Rosters' })).toBeInTheDocument();
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
      expect(screen.getByRole('heading', { name: 'Da Beers at Oakdale Tigers' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Back to schedule' })).toBeInTheDocument();
    expect(screen.getByText('Kerr Park')).toBeInTheDocument();
    expect(screen.getByText('Field 1')).toBeInTheDocument();
    expect(screen.getByText('6:00 PM')).toBeInTheDocument();
    const attLines = screen.getAllByText((_, node) => node?.classList.contains('game-att-line') ?? false);
    expect(attLines[0].textContent).toMatch(/Da Beers:\s*🥎 1 · 💩 1 · — 0/);
    expect(attLines[1].textContent).toMatch(/Oakdale Tigers:\s*🥎 0 · 💩 0 · — 0/);
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
      expect(screen.getByRole('heading', { name: 'Da Beers at Oakdale Tigers' })).toBeInTheDocument();
    });
  });

  it('shows registered members with profiles and unregistered placeholders on Rosters', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Rosters' }));
    await waitFor(() => {
      expect(screen.getByText('Pat Shortstop')).toBeInTheDocument();
    });
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('Unregistered')).toBeInTheDocument();
    expect(screen.getByText('Placeholder Guy')).toBeInTheDocument();
    expect(screen.getByText('#12 · SS')).toBeInTheDocument();
    expect(screen.getByText('Manager: Coach')).toBeInTheDocument();
    expect(screen.getByText('Manager')).toBeInTheDocument();
    expect(screen.getByText(/Check-in — Week 1 · Wed May 6/)).toBeInTheDocument();
    expect(screen.getByText(/🥎 1 · 💩 0 · — 1/)).toBeInTheDocument();
    expect(screen.getByLabelText('Coach is in')).toHaveTextContent('🥎');
    expect(screen.getByLabelText("Pat Shortstop hasn't checked in")).toHaveTextContent('—');
    expect(screen.queryByRole('button', { name: /i'm there/i })).not.toBeInTheDocument();
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
    expect(screen.getByText('Oakdale Tigers')).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('tab', { name: 'Rosters' }));
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
      expect(screen.getByLabelText("Pat Shortstop can't make it")).toHaveTextContent('💩');
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
          return jsonOk({ guestsCreated: 72, checkIns: 72, messages: 28, gamesPlayed: 44 });
        }
        if (url.includes('/api/admin/test-data/clear') && init?.method === 'POST') {
          return jsonOk({ guestsRemoved: 72, checkInsRemoved: 72, messagesRemoved: 28, gamesReset: 44 });
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
        screen.getByText('Created 72 guests, 72 check-ins, 28 messages, 44 games scored'),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear test data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm clear' }));
    await waitFor(() => {
      expect(screen.getByText('Removed 72 guests, reset 44 games')).toBeInTheDocument();
    });
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
      label: 'Red, white & blue',
      primary: '#1d3557',
      accent: '#e63946',
      navy: '#1d3557',
      navyLight: '#27436b',
      accentDark: '#c1121f',
      heading: '#1d3557',
      onAccent: '#ffffff',
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
    fireEvent.click(screen.getByRole('button', { name: /red, white & blue/i }));
    await waitFor(() => {
      expect(screen.getByText('Color scheme saved: Red, white & blue.')).toBeInTheDocument();
    });
    expect(document.documentElement.style.getPropertyValue('--navy')).toBe('#1d3557');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#e63946');
  });
});
