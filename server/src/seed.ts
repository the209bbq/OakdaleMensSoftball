import type { LeagueData } from './types.js';

export function createSeedData(): LeagueData {
  const teams = [
    { id: 'nothin-but-dingers', name: 'Nothin but Dingers' },
    { id: 'sig-twisted', name: 'Sig & Twisted' },
    { id: 'camp-boys', name: 'Camp Boys' },
    { id: 'moonlighters', name: 'Moonlighters' },
    { id: 'flying-demons', name: 'Flying Demons' },
    { id: 'da-beers', name: 'Da Beers' },
    { id: 'here-4-beer', name: 'Here 4 Beer' },
    { id: 'whiskey-rebels', name: 'Whiskey Rebels' },
  ];

  const rules = [
    "OAKDALE MEN'S SOFTBALL — BEER LEAGUE RULES",
    '',
    'We play rec softball. The record counts. So does the cooler.',
    '',
    '1. Ten in the field. Fifteen on the roster. Check in from Home if you are coming.',
    '2. First pitch is the listed time. Managers set the batting order the day before.',
    '3. Players on either team can keep the live book. One game, one scoreboard.',
    '4. Tap beers for the dugout that drank them. The tally is public and updates live.',
    '5. Home team brings a cooler. Visitors bring bats and a better excuse.',
    '6. Disputes stay at the field. If it is still unclear, the next batter hits.',
    '7. Rain, darkness, or an empty keg can end it after five if both managers agree.',
    '8. Free agency stays open until playoffs. Join a team from Home.',
    '9. Have fun, do not be a hero in the infield, and get your guy home.',
  ].join('\n');

  return { teams, players: [], games: [], users: [], rules, pendingManagers: [] };
}
