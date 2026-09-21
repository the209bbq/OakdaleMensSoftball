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

  return { teams, players: [], games: [], users: [], rules };
}
