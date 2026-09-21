import type { LeagueData } from './types.js';

export function createSeedData(): LeagueData {
  const teams = [
    { id: 'tigers', name: 'Oakdale Tigers' },
    { id: 'sluggers', name: 'Maple Street Sluggers' },
    { id: 'bombers', name: 'Riverside Bombers' },
    { id: 'aces', name: 'Downtown Aces' },
  ];

  const players = [
    { id: 'p1', teamId: 'tigers', name: 'Mike Reynolds', number: 12, position: 'Pitcher' },
    { id: 'p2', teamId: 'tigers', name: 'Carlos Diaz', number: 7, position: 'Shortstop' },
    { id: 'p3', teamId: 'tigers', name: 'Andre Wallace', number: 24, position: 'Catcher' },
    { id: 'p4', teamId: 'sluggers', name: 'Tom Becker', number: 3, position: 'First Base' },
    { id: 'p5', teamId: 'sluggers', name: 'Jamal Whitfield', number: 15, position: 'Center Field' },
    { id: 'p6', teamId: 'bombers', name: 'Danny O\'Brien', number: 9, position: 'Third Base' },
    { id: 'p7', teamId: 'bombers', name: 'Ricky Nguyen', number: 21, position: 'Left Field' },
    { id: 'p8', teamId: 'aces', name: 'Steve Kaminski', number: 5, position: 'Second Base' },
    { id: 'p9', teamId: 'aces', name: 'Luis Ferreira', number: 18, position: 'Right Field' },
  ];

  const games = [
    { id: 'g1', date: '2026-05-04', homeTeamId: 'tigers', awayTeamId: 'sluggers', homeScore: 8, awayScore: 5, played: true },
    { id: 'g2', date: '2026-05-04', homeTeamId: 'bombers', awayTeamId: 'aces', homeScore: 6, awayScore: 6, played: true },
    { id: 'g3', date: '2026-05-11', homeTeamId: 'tigers', awayTeamId: 'bombers', homeScore: 10, awayScore: 3, played: true },
    { id: 'g4', date: '2026-05-11', homeTeamId: 'sluggers', awayTeamId: 'aces', homeScore: 4, awayScore: 7, played: true },
    { id: 'g5', date: '2026-05-18', homeTeamId: 'aces', awayTeamId: 'tigers', homeScore: null, awayScore: null, played: false },
    { id: 'g6', date: '2026-05-18', homeTeamId: 'sluggers', awayTeamId: 'bombers', homeScore: null, awayScore: null, played: false },
  ];

  const rules = [
    'OAKDALE MEN\'S SOFTBALL — OFFICIAL LEAGUE RULES (PLACEHOLDER)',
    '',
    '1. Placeholder: All disputes are settled by a best-of-three thumb war at home plate.',
    '2. Placeholder: The home team must provide at least one (1) cooler of orange slices.',
    '3. Placeholder: A home run earns 1 run and 1 high-five (the high-five is mandatory).',
    '4. Placeholder: If it rains, everyone agrees it was going to be a tie anyway.',
    '5. Placeholder: The team with the coolest jerseys gets to bat first. Umpire decides.',
    '6. Placeholder: Heckling is permitted only in the form of encouraging haiku.',
    '7. Placeholder: Any dog that runs onto the field is automatically named MVP.',
    '8. TODO: Replace this entire section with the real league rules before opening day.',
  ].join('\n');

  return { teams, players, games, users: [], rules };
}
