import { describe, expect, it } from 'vitest';
import { emptyBattingLine } from './gameScoring.js';
import {
  FA_SECTION_TITLE,
  PLAYER_STATS_HEADERS,
  PLAYER_STATS_TAB,
  buildPlayerStatsWorkbook,
  csvEscape,
  groupPlayersByTeam,
  playerStatsToCsv,
  toSheetPlayerRow,
} from './playerStatsSheet.js';

const teams = [
  { id: 'dingers', name: 'Nothin but Dingers' },
  { id: 'beers', name: 'Da Beers' },
];

describe('groupPlayersByTeam', () => {
  it('lists every team and the players attached to that team', () => {
    const sections = groupPlayersByTeam(teams, [
      {
        id: 'p-beers-2',
        name: 'Zed',
        number: 22,
        position: 'OF',
        teamId: 'beers',
        teamName: 'Da Beers',
        stats: { ...emptyBattingLine(), gamesPlayed: 2, hits: 3, atBats: 8, average: '.375', doubles: 1 },
      },
      {
        id: 'p-dingers-1',
        name: 'Pat',
        number: 12,
        position: 'SS',
        teamId: 'dingers',
        teamName: 'Nothin but Dingers',
        stats: { ...emptyBattingLine(), gamesPlayed: 1, hits: 1, atBats: 3, average: '.333', singles: 1 },
      },
      {
        id: 'p-beers-1',
        name: 'Ada',
        number: 4,
        position: 'P',
        teamId: 'beers',
        teamName: 'Da Beers',
        stats: emptyBattingLine(),
      },
    ]);

    expect(sections.map((s) => s.teamName)).toEqual(['Nothin but Dingers', 'Da Beers']);
    expect(sections[0].players.map((p) => p.player)).toEqual(['Pat']);
    expect(sections[1].players.map((p) => p.player)).toEqual(['Ada', 'Zed']);
    expect(sections[0].players[0]).toMatchObject({ gp: 1, hits: 1, ab: 3, avg: '.333', singles: 1 });
    expect(sections[1].players[1]).toMatchObject({ hits: 3, doubles: 1, avg: '.375' });
  });

  it('keeps empty team sections and puts free agents in an FA block', () => {
    const sections = groupPlayersByTeam(teams, [
      { id: 'fa-1', name: 'Free Agent Joe', number: 7, position: '1B', teamId: null, teamName: null },
    ]);
    expect(sections).toHaveLength(3);
    expect(sections[0].players).toEqual([]);
    expect(sections[1].players).toEqual([]);
    expect(sections[2].teamName).toBe(FA_SECTION_TITLE);
    expect(sections[2].teamId).toBeNull();
    expect(sections[2].players[0].player).toBe('Free Agent Joe');
  });

  it('omits the FA section when everyone is attached', () => {
    const sections = groupPlayersByTeam(teams, [
      { id: 'p1', name: 'Pat', number: 1, teamId: 'dingers', teamName: 'Nothin but Dingers' },
    ]);
    expect(sections.map((s) => s.teamName)).toEqual(['Nothin but Dingers', 'Da Beers']);
  });
});

describe('buildPlayerStatsWorkbook', () => {
  it('builds team-categorized values and a paste-ready CSV', () => {
    const book = buildPlayerStatsWorkbook({
      teams,
      spreadsheetId: 'sheet-123',
      updatedAt: '2026-09-27T04:00:00.000Z',
      players: [
        {
          id: 'p1',
          name: 'Pat "Slugger"',
          number: 12,
          position: 'SS',
          teamId: 'dingers',
          teamName: 'Nothin but Dingers',
          stats: {
            gamesPlayed: 3,
            hits: 4,
            atBats: 10,
            average: '.400',
            singles: 2,
            doubles: 1,
            triples: 0,
            homers: 1,
            strikeouts: 1,
            outs: 4,
          },
        },
        {
          id: 'fa-1',
          name: 'Unattached',
          number: null,
          teamId: null,
          teamName: null,
          stats: emptyBattingLine(),
        },
      ],
    });

    expect(book.tab).toBe(PLAYER_STATS_TAB);
    expect(book.spreadsheetId).toBe('sheet-123');
    expect(book.teamCount).toBe(2);
    expect(book.playerCount).toBe(2);
    expect(book.freeAgentCount).toBe(1);
    expect(book.values[0][0]).toContain("Oakdale Men's Softball");
    expect(book.values[3]).toEqual(['Nothin but Dingers']);
    expect(book.values[4]).toEqual([...PLAYER_STATS_HEADERS]);
    expect(book.values[5]).toEqual(['Pat "Slugger"', '12', 'SS', 3, 4, 10, '.400', 2, 1, 0, 1, 1, 4]);
    expect(book.values.some((row) => row[0] === 'Da Beers')).toBe(true);
    expect(book.values.some((row) => row[0] === '(no players attached)')).toBe(true);
    expect(book.values.some((row) => row[0] === FA_SECTION_TITLE)).toBe(true);
    expect(book.csv).toContain('"Pat ""Slugger""",12,SS,3,4,10,.400,2,1,0,1,1,4');
    expect(book.csv.endsWith('\n')).toBe(true);
  });

  it('escapes commas and quotes in CSV cells', () => {
    expect(csvEscape('Camp Boys')).toBe('Camp Boys');
    expect(csvEscape('Last, First')).toBe('"Last, First"');
    expect(playerStatsToCsv([['A', 'B,C']])).toBe('A,"B,C"\n');
  });

  it('fills missing play-type columns with zeros', () => {
    const row = toSheetPlayerRow({
      id: 'p1',
      name: 'Pat',
      number: null,
      teamId: 'dingers',
      teamName: 'Nothin but Dingers',
      stats: { gamesPlayed: 1, hits: 1, atBats: 2, average: '.500' },
    });
    expect(row).toMatchObject({
      number: '',
      gp: 1,
      hits: 1,
      ab: 2,
      avg: '.500',
      singles: 0,
      doubles: 0,
      triples: 0,
      homers: 0,
      strikeouts: 0,
      outs: 0,
    });
  });
});
