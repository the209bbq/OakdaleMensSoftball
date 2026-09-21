import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const standings = [
  { teamId: 'tigers', teamName: 'Oakdale Tigers', wins: 2, losses: 0, ties: 0, runsFor: 18, runsAgainst: 8, gamesPlayed: 2 },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/api/standings')) {
        return { ok: true, json: async () => standings } as Response;
      }
      return { ok: true, json: async () => [] } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders the app bar title', () => {
    render(<App />);
    expect(screen.getByText(/Oakdale MSB/i)).toBeInTheDocument();
  });

  it('renders bottom tab navigation', () => {
    render(<App />);
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Rosters' })).toBeInTheDocument();
  });

  it('shows standings loaded from the API', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Oakdale Tigers')).toBeInTheDocument();
    });
  });
});
