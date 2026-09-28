import { describe, expect, it } from 'vitest';
import { leagueDateKey } from './leagueTime.js';

describe('leagueDateKey', () => {
  it('keeps Wednesday night in the Wednesday date through Thursday 12:00 AM Pacific', () => {
    // Wednesday May 6 2026 11:59 PM PDT = Thursday 06:59 UTC
    expect(leagueDateKey(new Date('2026-05-07T06:59:00.000Z'))).toBe('2026-05-06');
    // Thursday May 7 2026 12:00 AM PDT
    expect(leagueDateKey(new Date('2026-05-07T07:00:00.000Z'))).toBe('2026-05-06');
  });

  it('rolls to Thursday at 12:01 AM Pacific', () => {
    expect(leagueDateKey(new Date('2026-05-07T07:01:00.000Z'))).toBe('2026-05-07');
  });
});
