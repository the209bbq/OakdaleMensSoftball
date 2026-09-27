import { SIM_EMAIL_DOMAIN } from './store.js';

export type MailTransport = 'resend' | 'smtp' | 'none';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

export interface Mailer {
  configured: boolean;
  transport: MailTransport;
  from: string;
  send(message: MailMessage): Promise<void>;
}

export interface MailStatus {
  configured: boolean;
  transport: MailTransport;
  from: string | null;
  notifyEmails: string[];
  publicAppUrl: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DEFAULT_FROM_NAME = "Oakdale Men's Softball";
const USER_AGENT = 'oakdale-mens-softball/1.0';

export function isDeliverableEmail(email: string | null | undefined): boolean {
  const value = (email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(value)) return false;
  if (value.endsWith('.local')) return false;
  if (value.endsWith(SIM_EMAIL_DOMAIN)) return false;
  return true;
}

export function normalizeEmailList(input: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (input ?? '').split(/[,;\s]+/)) {
    const email = part.trim().toLowerCase();
    if (!isDeliverableEmail(email) || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export function collectNotifyEmails(input: {
  envNotify?: string | null;
  adminEmail?: string | null;
  adminUsers?: Array<{ email: string; role: string }>;
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (email: string | null | undefined) => {
    const value = (email ?? '').trim().toLowerCase();
    if (!isDeliverableEmail(value) || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  };
  for (const email of normalizeEmailList(input.envNotify)) push(email);
  push(input.adminEmail);
  for (const user of input.adminUsers ?? []) {
    if (user.role === 'admin') push(user.email);
  }
  return out;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function defaultMailFrom(env: NodeJS.ProcessEnv = process.env): string {
  const configured = (env.MAIL_FROM ?? '').trim();
  if (configured) return configured;
  const host = publicHost(env.PUBLIC_APP_URL);
  return `${DEFAULT_FROM_NAME} <noreply@${host}>`;
}

export function publicAppUrlFrom(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '');
  return raw || 'https://oakdale-mens-softball.fly.dev';
}

function publicHost(url: string | undefined): string {
  try {
    return new URL((url ?? '').trim() || 'https://oakdale-mens-softball.fly.dev').hostname;
  } catch {
    return 'oakdale-mens-softball.fly.dev';
  }
}

export function buildWelcomeEmail(
  user: { name: string; email: string },
  publicAppUrl: string,
): MailMessage {
  const first = user.name.trim().split(/\s+/)[0] || 'there';
  const url = publicAppUrl.replace(/\/+$/, '');
  return {
    to: user.email,
    subject: "Welcome to Oakdale Men's Softball",
    text: [
      `Hey ${first},`,
      '',
      "Your Oakdale Men's Softball player account is ready.",
      `Sign in at ${url} to see your team, next game, and check in.`,
      '',
      'See you at Kerr Park.',
    ].join('\n'),
    html: [
      `<p>Hey ${escapeHtml(first)},</p>`,
      `<p>Your Oakdale Men's Softball player account is ready.</p>`,
      `<p><a href="${escapeHtml(url)}">Sign in</a> to see your team, next game, and check in.</p>`,
      '<p>See you at Kerr Park.</p>',
    ].join(''),
  };
}

export function buildSignupNotifyEmail(
  user: { name: string; email: string },
  publicAppUrl: string,
): MailMessage {
  const url = publicAppUrl.replace(/\/+$/, '');
  const adminUrl = `${url}/admin`;
  return {
    to: '',
    subject: `New player signup: ${user.name}`,
    text: [
      `${user.name} (${user.email}) just created a player account.`,
      `Open Admin to attach them to a team: ${adminUrl}`,
    ].join('\n'),
    html: [
      `<p><strong>${escapeHtml(user.name)}</strong> (${escapeHtml(user.email)}) just created a player account.</p>`,
      `<p><a href="${escapeHtml(adminUrl)}">Open Admin</a> to attach them to a team.</p>`,
    ].join(''),
  };
}

export function buildTestEmail(to: string, publicAppUrl: string): MailMessage {
  const url = publicAppUrl.replace(/\/+$/, '');
  return {
    to,
    subject: "Oakdale Men's Softball mail test",
    text: `Signup email notifications are working. League site: ${url}`,
    html: `<p>Signup email notifications are working.</p><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
  };
}

export async function sendSignupNotifications(options: {
  mailer: Mailer;
  user: { name: string; email: string };
  notifyEmails: string[];
  publicAppUrl: string;
}): Promise<{ welcome: boolean; notified: string[] }> {
  const result = { welcome: false, notified: [] as string[] };
  if (!options.mailer.configured) return result;

  const replyTo = options.notifyEmails[0];
  if (isDeliverableEmail(options.user.email)) {
    const welcome = buildWelcomeEmail(options.user, options.publicAppUrl);
    if (replyTo) welcome.replyTo = replyTo;
    await options.mailer.send(welcome);
    result.welcome = true;
  }

  const notify = buildSignupNotifyEmail(options.user, options.publicAppUrl);
  if (replyTo) notify.replyTo = replyTo;
  for (const to of options.notifyEmails) {
    if (to === options.user.email.toLowerCase()) continue;
    await options.mailer.send({ ...notify, to });
    result.notified.push(to);
  }
  return result;
}

class NoopMailer implements Mailer {
  readonly configured = false;
  readonly transport = 'none' as const;
  constructor(readonly from: string) {}
  async send(): Promise<void> {
    // Intentionally empty: signup still succeeds when mail is not configured.
  }
}

class ResendMailer implements Mailer {
  readonly configured = true;
  readonly transport = 'resend' as const;
  constructor(
    readonly from: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    });
    if (res.ok) return;
    let detail = res.statusText || `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      detail = body.message || body.error || detail;
    } catch {
      // keep status text
    }
    throw new Error(`Resend could not send mail: ${detail}`);
  }
}

interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
}

class SmtpMailer implements Mailer {
  readonly configured = true;
  readonly transport = 'smtp' as const;
  constructor(
    readonly from: string,
    private readonly smtp: SmtpSettings,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: this.smtp.host,
      port: this.smtp.port,
      secure: this.smtp.secure,
      auth: this.smtp.user ? { user: this.smtp.user, pass: this.smtp.pass } : undefined,
    });
    await transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      replyTo: message.replyTo,
    });
  }
}

export function parseSmtpSettings(env: NodeJS.ProcessEnv = process.env): SmtpSettings | null {
  const url = (env.SMTP_URL ?? '').trim();
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'smtp:' && parsed.protocol !== 'smtps:') return null;
      if (!parsed.hostname) return null;
      return {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : parsed.protocol === 'smtps:' ? 465 : 587,
        user: decodeURIComponent(parsed.username),
        pass: decodeURIComponent(parsed.password),
        secure: parsed.protocol === 'smtps:' || parsed.searchParams.get('secure') === 'true',
      };
    } catch {
      return null;
    }
  }
  const host = (env.SMTP_HOST ?? '').trim();
  if (!host) return null;
  const port = Number(env.SMTP_PORT || 587);
  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    user: (env.SMTP_USER ?? '').trim(),
    pass: env.SMTP_PASS ?? '',
    secure: env.SMTP_SECURE === 'true' || env.SMTP_PORT === '465',
  };
}

export function createMailer(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Mailer {
  const from = defaultMailFrom(env);
  const resendKey = (env.RESEND_API_KEY ?? '').trim();
  if (resendKey) return new ResendMailer(from, resendKey, fetchImpl);
  const smtp = parseSmtpSettings(env);
  if (smtp) return new SmtpMailer(from, smtp);
  return new NoopMailer(from);
}

export function describeMailStatus(input: {
  mailer: Mailer;
  notifyEmails: string[];
  publicAppUrl: string;
}): MailStatus {
  return {
    configured: input.mailer.configured,
    transport: input.mailer.transport,
    from: input.mailer.configured ? input.mailer.from : null,
    notifyEmails: input.notifyEmails,
    publicAppUrl: input.publicAppUrl,
  };
}
