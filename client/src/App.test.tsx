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

  it('expands a schedule game to show field, time, location, and week', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Schedule' }));
    await waitFor(() => {
      expect(screen.getByText(/Week 1 — Wed May 6/)).toBeInTheDocument();
    });
    const toggle = screen.getByRole('button', { name: /show details for da beers at oakdale tigers/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Kerr Park')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByText('Kerr Park')).toBeInTheDocument();
    expect(screen.getByText('Field 1')).toBeInTheDocument();
    expect(screen.getByText('6:00 PM')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hide details/i })).toHaveAttribute('aria-expanded', 'true');
    const attLines = screen.getAllByText((_, node) => node?.classList.contains('game-att-line') ?? false);
    expect(attLines[0].textContent).toMatch(/Da Beers:\s*🥎 1 · 💩 1 · — 0/);
    expect(attLines[1].textContent).toMatch(/Oakdale Tigers:\s*🥎 0 · 💩 0 · — 0/);
  });

  it('shows compact per-team attendance chips on collapsed schedule rows', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Schedule' }));
    await waitFor(() => {
      expect(screen.getByText(/Week 1 — Wed May 6/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText('1 of 2 checked in')).toHaveTextContent('🥎 1/2');
    expect(screen.getByLabelText('No roster accounts')).toHaveTextContent('—');
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
    const grass = {
      ...theme,
      id: 'grass' as const,
      label: 'Grass field',
      primary: '#14532d',
      accent: '#facc15',
      navy: '#14532d',
      heading: '#14532d',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/api/auth/me')) return jsonOk({ user: adminUser });
        if (url.includes('/api/theme') && init?.method === 'PUT') {
          const body = JSON.parse(String(init.body ?? '{}')) as { id?: string };
          return jsonOk(body.id === 'grass' ? grass : theme);
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
    expect(screen.getByText('Everyone in the league sees the scheme you save.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /grass field/i }));
    await waitFor(() => {
      expect(screen.getByText('Color scheme saved: Grass field.')).toBeInTheDocument();
    });
    expect(document.documentElement.style.getPropertyValue('--navy')).toBe('#14532d');
  });
});
