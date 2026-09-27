import type { Request, Response, Router } from 'express';
import type { LeagueStore } from './store.js';
import { googleSheetsConfigured, writePlayerStatsSheet } from './googleSheets.js';
import { spreadsheetUrlFor, type PlayerStatsWorkbook } from './playerStatsSheet.js';

export function persistSpreadsheetId(store: LeagueStore): void {
  const settings = store.getSheetsSettings();
  store.setSheetsSettings({ spreadsheetId: settings.spreadsheetId });
}

export async function syncPlayerStatsSheet(
  store: LeagueStore,
  options: { dryRun: boolean },
): Promise<{
  ok: true;
  dryRun: boolean;
  wrote: boolean;
  configured: boolean;
  spreadsheetId: string;
  spreadsheetUrl: string;
  tab: string;
  createdTab?: boolean;
  updatedCells?: number;
  teamCount: number;
  playerCount: number;
  freeAgentCount: number;
  updatedAt: string;
  sections: PlayerStatsWorkbook['sections'];
  values: PlayerStatsWorkbook['values'];
}> {
  const book = store.buildPlayerStatsWorkbook();
  const configured = googleSheetsConfigured();
  if (options.dryRun || !configured) {
    store.setSheetsSettings({
      spreadsheetId: book.spreadsheetId,
      lastSyncAt: book.updatedAt,
      lastSyncStatus: 'dry-run',
      lastSyncError: configured
        ? null
        : 'Google credentials are not set. Download the CSV or add GOOGLE_SERVICE_ACCOUNT_JSON.',
      lastSyncPlayerCount: book.playerCount,
    });
    return {
      ok: true,
      dryRun: true,
      wrote: false,
      configured,
      spreadsheetId: book.spreadsheetId,
      spreadsheetUrl: spreadsheetUrlFor(book.spreadsheetId),
      tab: book.tab,
      teamCount: book.teamCount,
      playerCount: book.playerCount,
      freeAgentCount: book.freeAgentCount,
      updatedAt: book.updatedAt,
      sections: book.sections,
      values: book.values,
    };
  }

  try {
    const written = await writePlayerStatsSheet({
      spreadsheetId: book.spreadsheetId,
      values: book.values,
      tab: book.tab,
    });
    store.setSheetsSettings({
      spreadsheetId: book.spreadsheetId,
      lastSyncAt: book.updatedAt,
      lastSyncStatus: 'ok',
      lastSyncError: null,
      lastSyncPlayerCount: book.playerCount,
    });
    return {
      ok: true,
      dryRun: false,
      wrote: true,
      configured,
      spreadsheetId: book.spreadsheetId,
      spreadsheetUrl: spreadsheetUrlFor(book.spreadsheetId),
      tab: book.tab,
      createdTab: written.createdTab,
      updatedCells: written.updatedCells,
      teamCount: book.teamCount,
      playerCount: book.playerCount,
      freeAgentCount: book.freeAgentCount,
      updatedAt: book.updatedAt,
      sections: book.sections,
      values: book.values,
    };
  } catch (err) {
    store.setSheetsSettings({
      spreadsheetId: book.spreadsheetId,
      lastSyncAt: book.updatedAt,
      lastSyncStatus: 'error',
      lastSyncError: (err as Error).message,
      lastSyncPlayerCount: book.playerCount,
    });
    throw err;
  }
}

export function queuePlayerStatsSheetSync(store: LeagueStore): void {
  if (!googleSheetsConfigured()) return;
  setImmediate(() => {
    void syncPlayerStatsSheet(store, { dryRun: false }).catch((err) => {
      console.warn('[sheets] post-game sync failed:', (err as Error).message);
    });
  });
}

export function registerPlayerStatsSheetRoutes(
  api: Router,
  store: LeagueStore,
  requireAdmin: (req: Request, res: Response, next: () => void) => void,
): void {
  api.get('/admin/player-stats-sheet', requireAdmin, (_req: Request, res: Response) => {
    persistSpreadsheetId(store);
    const settings = store.getSheetsSettings();
    const book = store.buildPlayerStatsWorkbook();
    res.json({
      spreadsheetId: settings.spreadsheetId,
      spreadsheetUrl: spreadsheetUrlFor(settings.spreadsheetId),
      tab: book.tab,
      configured: googleSheetsConfigured(),
      lastSyncAt: settings.lastSyncAt,
      lastSyncStatus: settings.lastSyncStatus,
      lastSyncError: settings.lastSyncError,
      lastSyncPlayerCount: settings.lastSyncPlayerCount,
      teamCount: book.teamCount,
      playerCount: book.playerCount,
      freeAgentCount: book.freeAgentCount,
    });
  });

  api.post('/admin/player-stats-sheet/sync', requireAdmin, async (req: Request, res: Response) => {
    persistSpreadsheetId(store);
    const dryRun = req.body?.dryRun === true || req.query.dryRun === '1';
    try {
      res.json(await syncPlayerStatsSheet(store, { dryRun }));
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  api.get('/admin/player-stats-sheet.csv', requireAdmin, (_req: Request, res: Response) => {
    persistSpreadsheetId(store);
    const book = store.buildPlayerStatsWorkbook();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="oakdale-player-stats.csv"');
    res.send(book.csv);
  });
}
