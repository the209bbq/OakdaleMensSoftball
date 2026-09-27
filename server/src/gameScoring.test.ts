import { describe, expect, it } from 'vitest';
import {
  GAME_DURATION_MS,
  MANAGER_EARLY_START_MS,
  SCORING_GRACE_MS,
  LINEUP_LOCK_MS,
  boxFromParts,
  canEditLineup,
  canScoreLiveGame,
  canStartLiveGame,
  formatBattingAverage,
  isAtBatResult,
  isHitResult,
  normalizePlayResult,
  scoringWindow,
  stepBatterIndex,
  stepHalfInning,
  tallyBattingLine,
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
    const box = boxFromParts(null, 4, { homeHits: 3, currentOuts: 4, awayBeers: 6 });
    expect(box.homeRuns).toBe(0);
    expect(box.awayRuns).toBe(4);
    expect(box.homeHits).toBe(3);
    expect(box.homeBeers).toBe(0);
    expect(box.awayBeers).toBe(6);
    expect(box.currentOuts).toBe(1);
    expect(box.awayLine[0]).toBe(4);
    expect(box.awayLine).toHaveLength(7);
    expect(box.homeLine).toHaveLength(7);
    expect(box.batterUp).toBe('away');
  });
});

describe('stepHalfInning', () => {
  it('opens extra innings after the bottom of the 7th', () => {
    const next = stepHalfInning(7, 'bottom', 2, 1);
    expect(next).toEqual({ inning: 8, half: 'top', outs: 0 });
  });
});

describe('canEditLineup', () => {
  it('lets managers edit until 24 hours before first pitch', () => {
    expect(canEditLineup(START, START - LINEUP_LOCK_MS - 1, false)).toBe(true);
    expect(canEditLineup(START, START - LINEUP_LOCK_MS, false)).toBe(false);
    expect(canEditLineup(START, START - LINEUP_LOCK_MS, true)).toBe(true);
  });
});

describe('stepBatterIndex', () => {
  it('wraps around the lineup', () => {
    expect(stepBatterIndex(2, 3, 1)).toBe(0);
    expect(stepBatterIndex(0, 3, -1)).toBe(2);
  });
});

describe('formatBattingAverage', () => {
  it('formats empty, thirds, and a perfect average', () => {
    expect(formatBattingAverage(0, 0)).toBe('.000');
    expect(formatBattingAverage(1, 3)).toBe('.333');
    expect(formatBattingAverage(2, 3)).toBe('.667');
    expect(formatBattingAverage(5, 5)).toBe('1.000');
  });
});

describe('play results', () => {
  it('maps legacy hit rows to a single and treats all six plays as at-bats', () => {
    expect(normalizePlayResult('hit')).toBe('single');
    expect(normalizePlayResult('HR')).toBe('homer');
    expect(normalizePlayResult('K')).toBe('strikeout');
    expect(isHitResult('double')).toBe(true);
    expect(isHitResult('walk')).toBe(false);
    expect(isAtBatResult('strikeout')).toBe(true);
    expect(isAtBatResult('walk')).toBe(false);
  });

  it('builds a batting line from mixed play types', () => {
    const line = tallyBattingLine([
      { gameId: 'g1', result: 'single' },
      { gameId: 'g1', result: 'double' },
      { gameId: 'g1', result: 'out' },
      { gameId: 'g1', result: 'walk' },
      { gameId: 'g2', result: 'hit' },
    ]);
    expect(line).toMatchObject({
      gamesPlayed: 2,
      hits: 3,
      atBats: 4,
      average: '.750',
      singles: 2,
      doubles: 1,
      outs: 1,
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
