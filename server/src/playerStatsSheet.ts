import { emptyBattingLine, type PlayerBattingLine } from './gameScoring.js';

/** David's Softball Stats workbook. Sync writes a dedicated tab only. */
export const DEFAULT_SPREADSHEET_ID = '1LwMlsDCZBEqCQqb2qW0lhpTlWNNa-OpcGOPQnbqj1wc';
export const PLAYER_STATS_TAB = 'Player Stats';
export const FA_SECTION_TITLE = 'Free Agents (unattached)';

export const PLAYER_STATS_HEADERS = [
  'Player',
  '#',
  'Pos',
  'GP',
  'Hits',
  'AB',
  'AVG',
  '1B',
  '2B',
  '3B',
  'HR',
  'K',
  'Out',
] as const;

export type SheetValue = string | number;

export interface SheetPlayerInput {
  id: string;
  name: string;
  number: number | null;
  position?: string;
  teamId: string | null;
  teamName: string | null;
  stats?: Partial<PlayerBattingLine> | null;
}

export interface SheetPlayerRow {
  id: string;
  player: string;
  number: string;
  position: string;
  gp: number;
  hits: number;
  ab: number;
  avg: string;
  singles: number;
  doubles: number;
  triples: number;
  homers: number;
  strikeouts: number;
  outs: number;
}

export interface TeamStatsSection {
  teamId: string | null;
  teamName: string;
  players: SheetPlayerRow[];
}

export interface PlayerStatsWorkbook {
  tab: string;
  spreadsheetId: string;
  updatedAt: string;
  sections: TeamStatsSection[];
  values: SheetValue[][];
  csv: string;
  teamCount: number;
  playerCount: number;
  freeAgentCount: number;
}

function statNumber(value: unknown): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function toSheetPlayerRow(player: SheetPlayerInput): SheetPlayerRow {
  const stats = { ...emptyBattingLine(), ...(player.stats ?? {}) };
  return {
    id: player.id,
    player: player.name.trim() || 'Unnamed',
    number: player.number == null ? '' : String(player.number),
    position: (player.position ?? '').trim(),
    gp: statNumber(stats.gamesPlayed),
    hits: statNumber(stats.hits),
    ab: statNumber(stats.atBats),
    avg: stats.average || '.000',
    singles: statNumber(stats.singles),
    doubles: statNumber(stats.doubles),
    triples: statNumber(stats.triples),
    homers: statNumber(stats.homers),
    strikeouts: statNumber(stats.strikeouts),
    outs: statNumber(stats.outs),
  };
}

function sortPlayers(players: SheetPlayerInput[]): SheetPlayerInput[] {
  return [...players].sort((a, b) => {
    const aHas = a.number != null;
    const bHas = b.number != null;
    if (aHas && bHas && a.number !== b.number) return a.number! - b.number!;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * One section per league team (even if empty), players attached to that team,
 * then an FA section when anyone is unattached.
 */
export function groupPlayersByTeam(
  teams: Array<{ id: string; name: string }>,
  players: SheetPlayerInput[],
): TeamStatsSection[] {
  const byTeam = new Map<string, SheetPlayerInput[]>();
  const unattached: SheetPlayerInput[] = [];
  for (const player of players) {
    if (player.teamId) {
      const list = byTeam.get(player.teamId) ?? [];
      list.push(player);
      byTeam.set(player.teamId, list);
    } else {
      unattached.push(player);
    }
  }

  const sections: TeamStatsSection[] = teams.map((team) => ({
    teamId: team.id,
    teamName: team.name,
    players: sortPlayers(byTeam.get(team.id) ?? []).map(toSheetPlayerRow),
  }));

  if (unattached.length > 0) {
    sections.push({
      teamId: null,
      teamName: FA_SECTION_TITLE,
      players: sortPlayers(unattached).map(toSheetPlayerRow),
    });
  }
  return sections;
}

export function rowValues(row: SheetPlayerRow): SheetValue[] {
  return [
    row.player,
    row.number,
    row.position,
    row.gp,
    row.hits,
    row.ab,
    row.avg,
    row.singles,
    row.doubles,
    row.triples,
    row.homers,
    row.strikeouts,
    row.outs,
  ];
}

export function buildPlayerStatsValues(sections: TeamStatsSection[], updatedAt: string): SheetValue[][] {
  const values: SheetValue[][] = [
    ["Oakdale Men's Softball — Player Stats"],
    [`Updated: ${updatedAt}`],
    [],
  ];
  for (const section of sections) {
    values.push([section.teamName]);
    values.push([...PLAYER_STATS_HEADERS]);
    if (section.players.length === 0) {
      values.push(['(no players attached)']);
    } else {
      for (const row of section.players) values.push(rowValues(row));
    }
    values.push([]);
  }
  return values;
}

export function csvEscape(value: SheetValue): string {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function playerStatsToCsv(values: SheetValue[][]): string {
  return values.map((row) => row.map(csvEscape).join(',')).join('\n') + '\n';
}

export function buildPlayerStatsWorkbook(input: {
  teams: Array<{ id: string; name: string }>;
  players: SheetPlayerInput[];
  spreadsheetId?: string;
  updatedAt?: string;
}): PlayerStatsWorkbook {
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  const spreadsheetId = (input.spreadsheetId ?? '').trim() || DEFAULT_SPREADSHEET_ID;
  const sections = groupPlayersByTeam(input.teams, input.players);
  const values = buildPlayerStatsValues(sections, updatedAt);
  const freeAgentCount = sections.find((section) => section.teamId === null)?.players.length ?? 0;
  return {
    tab: PLAYER_STATS_TAB,
    spreadsheetId,
    updatedAt,
    sections,
    values,
    csv: playerStatsToCsv(values),
    teamCount: sections.filter((section) => section.teamId !== null).length,
    playerCount: sections.reduce((total, section) => total + section.players.length, 0),
    freeAgentCount,
  };
}

export function spreadsheetUrlFor(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

export type SheetsSyncStatus = 'ok' | 'dry-run' | 'error' | null;

export interface SheetsSettings {
  spreadsheetId: string;
  lastSyncAt: string | null;
  lastSyncStatus: SheetsSyncStatus;
  lastSyncError: string | null;
  lastSyncPlayerCount: number | null;
}

export function defaultSheetsSettings(spreadsheetId = DEFAULT_SPREADSHEET_ID): SheetsSettings {
  return {
    spreadsheetId,
    lastSyncAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    lastSyncPlayerCount: null,
  };
}

export function parseSheetsSettings(raw: string | undefined, fallbackId = DEFAULT_SPREADSHEET_ID): SheetsSettings {
  const defaults = defaultSheetsSettings(fallbackId);
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as Partial<SheetsSettings>;
    const spreadsheetId = String(parsed.spreadsheetId ?? '').trim() || fallbackId;
    return {
      spreadsheetId,
      lastSyncAt: typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : null,
      lastSyncStatus:
        parsed.lastSyncStatus === 'ok' || parsed.lastSyncStatus === 'dry-run' || parsed.lastSyncStatus === 'error'
          ? parsed.lastSyncStatus
          : null,
      lastSyncError: typeof parsed.lastSyncError === 'string' ? parsed.lastSyncError : null,
      lastSyncPlayerCount:
        typeof parsed.lastSyncPlayerCount === 'number' && Number.isFinite(parsed.lastSyncPlayerCount)
          ? parsed.lastSyncPlayerCount
          : null,
    };
  } catch {
    return defaults;
  }
}

export function envSpreadsheetId(env: NodeJS.ProcessEnv = process.env): string {
  return env.SPREADSHEET_ID?.trim() || env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || DEFAULT_SPREADSHEET_ID;
}
