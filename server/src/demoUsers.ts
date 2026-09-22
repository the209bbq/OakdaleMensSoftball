import type { LeagueStore } from './store.js';

export interface SeedDemoUsersOptions {
  managerEmail?: string;
  managerName?: string;
  managerPassword?: string;
  playerEmail?: string;
  playerName?: string;
  playerPassword?: string;
  log?: Pick<Console, 'log' | 'warn'>;
}

export interface SeedDemoUsersResult {
  managerEmail: string;
  playerEmail: string;
  managerCreated: boolean;
  playerCreated: boolean;
}

const DEFAULTS = {
  managerEmail: 'manager@oakdale.local',
  managerName: 'Team Manager (demo)',
  managerPassword: 'ManagerTest2026',
  playerEmail: 'player@oakdale.local',
  playerName: 'Player (demo)',
  playerPassword: 'PlayerTest2026',
};

/**
 * Create-only demo manager/player bootstrap. Existing accounts are left
 * completely unchanged (role, teamId, name, and password).
 */
export function seedDemoUsers(store: LeagueStore, opts: SeedDemoUsersOptions = {}): SeedDemoUsersResult {
  const log = opts.log ?? console;
  const managerEmail = opts.managerEmail || DEFAULTS.managerEmail;
  const managerName = opts.managerName || DEFAULTS.managerName;
  const managerPassword = opts.managerPassword || DEFAULTS.managerPassword;
  const playerEmail = opts.playerEmail || DEFAULTS.playerEmail;
  const playerName = opts.playerName || DEFAULTS.playerName;
  const playerPassword = opts.playerPassword || DEFAULTS.playerPassword;

  let managerCreated = false;
  if (!store.getUserByEmail(managerEmail)) {
    const teams = store.getTeams();
    if (teams.length === 0) {
      log.warn('[oakdale-softball] Skipping demo team manager — no teams exist to assign');
    } else {
      const team = teams[0];
      store.registerUser({
        email: managerEmail,
        name: managerName,
        password: managerPassword,
        role: 'manager',
        teamId: team.id,
      });
      managerCreated = true;
      log.log(`[oakdale-softball] Demo team manager assigned to ${team.name} (${team.id})`);
    }
  }

  let playerCreated = false;
  if (!store.getUserByEmail(playerEmail)) {
    store.registerUser({
      email: playerEmail,
      name: playerName,
      password: playerPassword,
      role: 'player',
      teamId: null,
    });
    playerCreated = true;
  }

  return { managerEmail, playerEmail, managerCreated, playerCreated };
}
