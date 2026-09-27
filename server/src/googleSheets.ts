import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { PLAYER_STATS_TAB, type SheetValue } from './playerStatsSheet.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

export interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface SheetsWriteResult {
  spreadsheetId: string;
  tab: string;
  updatedCells: number;
  createdTab: boolean;
}

function base64Url(value: string | Buffer): string {
  const buf = typeof value === 'string' ? Buffer.from(value) : value;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function parseServiceAccountJson(raw: string): GoogleServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Google service account JSON must be an object');
  }
  const row = parsed as { client_email?: unknown; private_key?: unknown; token_uri?: unknown };
  const email = String(row.client_email ?? '').trim();
  const key = String(row.private_key ?? '').replace(/\\n/g, '\n');
  if (!email || !key.includes('BEGIN')) {
    throw new Error('Google service account JSON needs client_email and private_key');
  }
  return {
    client_email: email,
    private_key: key,
    token_uri: typeof row.token_uri === 'string' ? row.token_uri : TOKEN_URL,
  };
}

/** Load credentials from env. Never throws on missing config — the app must boot without Sheets. */
export function loadGoogleServiceAccount(
  env: NodeJS.ProcessEnv = process.env,
): GoogleServiceAccount | null {
  const inline = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) return parseServiceAccountJson(inline);
  const filePath = env.GOOGLE_SHEETS_CREDENTIALS?.trim();
  if (filePath && existsSync(filePath)) {
    return parseServiceAccountJson(readFileSync(filePath, 'utf8'));
  }
  return null;
}

export function googleSheetsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return loadGoogleServiceAccount(env) != null;
}

export function signServiceAccountJwt(
  account: GoogleServiceAccount,
  nowSec = Math.floor(Date.now() / 1000),
): string {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: SHEETS_SCOPE,
      aud: account.token_uri ?? TOKEN_URL,
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  return `${unsigned}.${base64Url(signer.sign(account.private_key))}`;
}

export async function getGoogleAccessToken(
  account: GoogleServiceAccount,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const assertion = signServiceAccountJwt(account);
  const res = await fetchImpl(account.token_uri ?? TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(body.error || `Google auth failed (${res.status})`);
  }
  return body.access_token;
}

async function sheetsRequest<T>(
  url: string,
  token: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const res = await fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(body.error?.message || `Google Sheets API failed (${res.status})`);
  }
  return body;
}

function quotedTab(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/**
 * Write values to the Player Stats tab only. Creates that tab when missing.
 * Other tabs (schedule, standings, leftover Sheet1, etc.) are left alone.
 */
export async function writePlayerStatsSheet(
  input: {
    spreadsheetId: string;
    values: SheetValue[][];
    tab?: string;
    account?: GoogleServiceAccount | null;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<SheetsWriteResult> {
  const account = input.account ?? loadGoogleServiceAccount();
  if (!account) {
    throw new Error(
      'Google Sheets credentials are not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SHEETS_CREDENTIALS.',
    );
  }
  const tab = input.tab ?? PLAYER_STATS_TAB;
  const token = await getGoogleAccessToken(account, fetchImpl);
  const meta = await sheetsRequest<{
    sheets?: Array<{ properties?: { title?: string; sheetId?: number } }>;
  }>(`${SHEETS_API}/${encodeURIComponent(input.spreadsheetId)}?fields=sheets.properties`, token, {}, fetchImpl);

  const exists = (meta.sheets ?? []).some((sheet) => sheet.properties?.title === tab);
  if (!exists) {
    await sheetsRequest(
      `${SHEETS_API}/${encodeURIComponent(input.spreadsheetId)}:batchUpdate`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title: tab } } }],
        }),
      },
      fetchImpl,
    );
  }

  const tabRange = `${quotedTab(tab)}!A:Z`;
  await sheetsRequest(
    `${SHEETS_API}/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(tabRange)}:clear`,
    token,
    { method: 'POST', body: '{}' },
    fetchImpl,
  );
  const written = await sheetsRequest<{ updatedCells?: number }>(
    `${SHEETS_API}/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(`${quotedTab(tab)}!A1`)}?valueInputOption=RAW`,
    token,
    { method: 'PUT', body: JSON.stringify({ values: input.values }) },
    fetchImpl,
  );
  return {
    spreadsheetId: input.spreadsheetId,
    tab,
    updatedCells: Number(written.updatedCells) || input.values.reduce((n, row) => n + row.length, 0),
    createdTab: !exists,
  };
}
