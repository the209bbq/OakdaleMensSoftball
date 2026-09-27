import { describe, expect, it } from 'vitest';
import {
  SIM_FREE_AGENT_COUNT,
  SIM_GUESTS_PER_TEAM,
  rotateLineup,
  simGuestName,
  simJersey,
  simPosition,
  simSkill,
  simWaiver,
} from './simSeason.js';

describe('simSeason helpers', () => {
  it('fills 15 roster spots per team plus a free-agent pool', () => {
    expect(SIM_GUESTS_PER_TEAM).toBe(15);
    expect(SIM_FREE_AGENT_COUNT).toBe(8);
  });

  it('rotates a 10-man lineup so bench players still start over 11 weeks', () => {
    const roster = Array.from({ length: 15 }, (_, i) => i);
    const week1 = rotateLineup(roster, 1, 10);
    const week2 = rotateLineup(roster, 2, 10);
    expect(week1).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(week2).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const seen = new Set<number>();
    for (let week = 1; week <= 11; week += 1) {
      for (const id of rotateLineup(roster, week, 10)) seen.add(id);
    }
    expect(seen.size).toBe(15);
  });

  it('gives every guest a unique name and mixed profile fields', () => {
    const names = Array.from({ length: 128 }, (_, i) => simGuestName(i));
    expect(new Set(names).size).toBe(128);
    expect(simJersey(0)).toBe(1);
    expect(simJersey(14)).toBe(15);
    expect(simPosition(0)).toBe('P');
    expect(simSkill(1)).toBe('regular');
    expect(simWaiver(1).waiverStatus).toBe('pending');
    expect(simWaiver(2).waiverStatus).toBe('approved');
    expect(simWaiver(4).waiverStatus).toBe('rejected');
    expect(simWaiver(5).waiverStatus).toBe('none');
  });
});
