import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  googleSheetsConfigured,
  loadGoogleServiceAccount,
  parseServiceAccountJson,
  signServiceAccountJwt,
  writePlayerStatsSheet,
} from './googleSheets.js';
import { PLAYER_STATS_TAB } from './playerStatsSheet.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

const account = {
  client_email: 'sheets@oakdale.iam.gserviceaccount.com',
  private_key: pem,
};

describe('Google Sheets credentials', () => {
  it('parses a service-account JSON object', () => {
    const parsed = parseServiceAccountJson(
      JSON.stringify({
        client_email: account.client_email,
        private_key: pem.replace(/\n/g, '\\n'),
      }),
    );
    expect(parsed.client_email).toBe(account.client_email);
    expect(parsed.private_key).toContain('BEGIN');
  });

  it('treats missing env as unconfigured so the server can boot', () => {
    expect(loadGoogleServiceAccount({})).toBeNull();
    expect(googleSheetsConfigured({})).toBe(false);
  });

  it('loads GOOGLE_SERVICE_ACCOUNT_JSON from env', () => {
    const loaded = loadGoogleServiceAccount({
      GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: account.client_email,
        private_key: pem,
      }),
    });
    expect(loaded?.client_email).toBe(account.client_email);
  });

  it('signs a service-account JWT with three segments', () => {
    const jwt = signServiceAccountJwt(account, 1_700_000_000);
    expect(jwt.split('.')).toHaveLength(3);
  });
});

describe('writePlayerStatsSheet', () => {
  it('creates the Player Stats tab when missing and does not clear other tabs', async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : undefined;
      calls.push({ url: href, method, body });
      if (href.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
      }
      if (href.includes('fields=sheets.properties')) {
        return new Response(JSON.stringify({ sheets: [{ properties: { title: 'Sheet1' } }] }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ updatedCells: 12 }), { status: 200 });
    }) as typeof fetch;

    const result = await writePlayerStatsSheet(
      {
        spreadsheetId: 'sheet-123',
        values: [['Player'], ['Pat']],
        account,
      },
      fetchImpl,
    );

    expect(result).toMatchObject({
      spreadsheetId: 'sheet-123',
      tab: PLAYER_STATS_TAB,
      createdTab: true,
    });
    expect(calls.some((c) => c.url.includes(':batchUpdate') && c.body?.includes(PLAYER_STATS_TAB))).toBe(true);
    expect(calls.some((c) => c.url.includes('Player%20Stats'))).toBe(true);
    expect(calls.every((c) => !c.url.includes('Sheet1'))).toBe(true);
  });

  it('refuses to write when credentials are missing', async () => {
    await expect(
      writePlayerStatsSheet({
        spreadsheetId: 'sheet-123',
        values: [['x']],
        account: null,
      }),
    ).rejects.toThrow(/credentials are not configured/i);
  });
});
