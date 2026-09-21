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
  },
];

const teams = [{ id: 'tigers', name: 'Oakdale Tigers' }];

const rosterPayload = {
  team: teams[0],
  roster: [{ id: 'p1', teamId: 'tigers', name: 'Placeholder Guy', number: 9, position: 'OF' }],
  members: [
    { id: 'u-mgr', name: 'Coach', number: 1, position: 'P', isManager: true },
    { id: 'u1', name: 'Pat Shortstop', number: 12, position: 'SS', isManager: false },
  ],
  manager: { name: 'Coach' },
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/api/auth/me')) {
        return { ok: true, json: async () => ({ user: null }) } as Response;
      }
      if (url.includes('/api/standings')) {
        return { ok: true, json: async () => standings } as Response;
      }
      if (url.includes('/api/schedule')) {
        return { ok: true, json: async () => scheduleGames } as Response;
      }
      if (url.includes('/roster')) {
        return { ok: true, json: async () => rosterPayload } as Response;
      }
      if (url.includes('/api/teams')) {
        return { ok: true, json: async () => teams } as Response;
      }
      return { ok: true, json: async () => [] } as Response;
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
  it('renders the app bar title', () => {
    renderApp();
    expect(screen.getByText(/Oakdale MSB/i)).toBeInTheDocument();
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
    expect(screen.getByRole('tab', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Rosters' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('shows standings loaded from the API', async () => {
    renderApp();
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
  });
});
