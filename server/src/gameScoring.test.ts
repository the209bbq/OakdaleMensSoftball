import { describe, expect, it } from 'vitest';
import {
  GAME_DURATION_MS,
  MANAGER_EARLY_START_MS,
  SCORING_GRACE_MS,
  boxFromParts,
  canScoreLiveGame,
  canStartLiveGame,
  scoringWindow,
  wrapCurrentOuts,
} from './gameScoring.js';

const START = Date.parse('2026-09-26T18:00:00');

describe('scoringWindow', () => {
  it('is upcoming before first pitch', () => {
    const w = scoringWindow(START, null, START - 1);
    expect(w.phase).toBe('upcoming');
    expect(w.open).toBe(false);
  });

  it('is live during the 2-hour game', () => {
    expect(scoringWindow(START, null, START).phase).toBe('live');
    expect(scoringWindow(START, null, START + GAME_DURATION_MS - 1).phase).toBe('live');
    expect(scoringWindow(START, null, START).open).toBe(true);
  });

  it('is grace for 24 hours after the game', () => {
    const after = START + GAME_DURATION_MS;
    expect(scoringWindow(START, null, after).phase).toBe('grace');
    expect(scoringWindow(START, null, after + SCORING_GRACE_MS - 1).phase).toBe('grace');
    expect(scoringWindow(START, null, after).open).toBe(true);
  });

  it('locks after the 24-hour grace', () => {
    const w = scoringWindow(START, null, START + GAME_DURATION_MS + SCORING_GRACE_MS);
    expect(w.phase).toBe('locked');
    expect(w.open).toBe(false);
  });

  it('uses a live start time when the manager has started the game', () => {
    const live = START - 3 * 60 * 60 * 1000;
    expect(scoringWindow(START, live, live + 1000).phase).toBe('live');
    expect(scoringWindow(START, live, live + GAME_DURATION_MS + 1000).phase).toBe('grace');
  });
});

describe('canStartLiveGame', () => {
  it('lets an admin start any unstarted game', () => {
    expect(canStartLiveGame(START, null, START - 40 * 24 * 60 * 60 * 1000, true)).toBe(true);
    expect(canStartLiveGame(START, START, START, true)).toBe(false);
  });

  it('lets a manager start from 2 hours before first pitch', () => {
    expect(canStartLiveGame(START, null, START - MANAGER_EARLY_START_MS, false)).toBe(true);
    expect(canStartLiveGame(START, null, START - MANAGER_EARLY_START_MS - 1, false)).toBe(false);
  });
});

describe('wrapCurrentOuts', () => {
  it('stays in 0–2', () => {
    expect(wrapCurrentOuts(0)).toBe(0);
    expect(wrapCurrentOuts(2)).toBe(2);
    expect(wrapCurrentOuts(3)).toBe(0);
    expect(wrapCurrentOuts(-1)).toBe(0);
  });
});

describe('boxFromParts', () => {
  it('treats missing scores as zeros and wraps current outs', () => {
    expect(boxFromParts(null, 4, { homeHits: 3, currentOuts: 4 })).toEqual({
      homeRuns: 0,
      awayRuns: 4,
      homeHits: 3,
      awayHits: 0,
      homeWalks: 0,
      awayWalks: 0,
      homeOuts: 0,
      awayOuts: 0,
      currentOuts: 1,
    });
  });
});

describe('canScoreLiveGame', () => {
  it('lets admins score when the window is closed', () => {
    const locked = scoringWindow(START, null, START + GAME_DURATION_MS + SCORING_GRACE_MS);
    expect(canScoreLiveGame(locked, true)).toBe(true);
    expect(canScoreLiveGame(locked, false)).toBe(false);
  });
});
