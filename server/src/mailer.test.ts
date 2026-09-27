import { describe, expect, it, vi } from 'vitest';
import {
  collectNotifyEmails,
  createMailer,
  defaultMailFrom,
  isDeliverableEmail,
  parseSmtpSettings,
  sendSignupNotifications,
  buildSignupNotifyEmail,
  buildWelcomeEmail,
} from './mailer.js';
import type { Mailer, MailMessage } from './mailer.js';

function recordingMailer(): Mailer & { sent: MailMessage[]; failWith: Error | null } {
  const sent: MailMessage[] = [];
  return {
    configured: true,
    transport: 'resend',
    from: "Oakdale Men's Softball <noreply@test.dev>",
    sent,
    failWith: null,
    async send(message: MailMessage) {
      if (this.failWith) throw this.failWith;
      sent.push(message);
    },
  };
}

describe('isDeliverableEmail', () => {
  it('accepts real inboxes and rejects local / sim addresses', () => {
    expect(isDeliverableEmail('david@example.com')).toBe(true);
    expect(isDeliverableEmail(' david@example.com ')).toBe(true);
    expect(isDeliverableEmail('admin@oakdale.local')).toBe(false);
    expect(isDeliverableEmail('guest1@sim.local')).toBe(false);
    expect(isDeliverableEmail('not-an-email')).toBe(false);
    expect(isDeliverableEmail('')).toBe(false);
  });
});

describe('collectNotifyEmails', () => {
  it('prefers SIGNUP_NOTIFY_EMAIL and skips .local admin accounts', () => {
    expect(
      collectNotifyEmails({
        envNotify: 'David@gmail.com, extra@league.com',
        adminEmail: 'commish@oakdale.local',
        adminUsers: [
          { email: 'commish@oakdale.local', role: 'admin' },
          { email: 'pat@example.com', role: 'player' },
        ],
      }),
    ).toEqual(['david@gmail.com', 'extra@league.com']);
  });

  it('falls back to a real admin email', () => {
    expect(
      collectNotifyEmails({
        adminEmail: 'commish@oakdale.local',
        adminUsers: [{ email: 'commish@example.com', role: 'admin' }],
      }),
    ).toEqual(['commish@example.com']);
  });
});

describe('createMailer', () => {
  it('is off when no provider is configured', () => {
    const mailer = createMailer({});
    expect(mailer.configured).toBe(false);
    expect(mailer.transport).toBe('none');
  });

  it('uses Resend when RESEND_API_KEY is set', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 }));
    const mailer = createMailer(
      { RESEND_API_KEY: 're_test', MAIL_FROM: 'League <noreply@oakdale.test>' },
      fetchImpl as unknown as typeof fetch,
    );
    expect(mailer.configured).toBe(true);
    expect(mailer.transport).toBe('resend');
    await mailer.send({
      to: 'pat@example.com',
      subject: 'Hello',
      text: 'Hi',
      html: '<p>Hi</p>',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer re_test',
      'User-Agent': 'oakdale-mens-softball/1.0',
    });
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.from).toBe('League <noreply@oakdale.test>');
    expect(body.to).toEqual(['pat@example.com']);
    expect(body.subject).toBe('Hello');
  });

  it('surfaces Resend API errors', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ message: 'domain not verified' }), { status: 403 }),
    );
    const mailer = createMailer({ RESEND_API_KEY: 're_test' }, fetchImpl as unknown as typeof fetch);
    await expect(
      mailer.send({ to: 'pat@example.com', subject: 'Hi', text: 'Hi', html: '<p>Hi</p>' }),
    ).rejects.toThrow(/domain not verified/i);
  });

  it('parses SMTP_URL and SMTP_HOST settings', () => {
    expect(parseSmtpSettings({ SMTP_URL: 'smtps://user%40gmail.com:app-pass@smtp.gmail.com:465' })).toEqual({
      host: 'smtp.gmail.com',
      port: 465,
      user: 'user@gmail.com',
      pass: 'app-pass',
      secure: true,
    });
    expect(parseSmtpSettings({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587', SMTP_USER: 'u', SMTP_PASS: 'p' })).toEqual({
      host: 'smtp.example.com',
      port: 587,
      user: 'u',
      pass: 'p',
      secure: false,
    });
    expect(createMailer({ SMTP_HOST: 'smtp.example.com' }).transport).toBe('smtp');
  });

  it('builds a default from address from the public app host', () => {
    expect(defaultMailFrom({ PUBLIC_APP_URL: 'https://oakdale-mens-softball.fly.dev' })).toBe(
      "Oakdale Men's Softball <noreply@oakdale-mens-softball.fly.dev>",
    );
  });
});

describe('sendSignupNotifications', () => {
  it('emails the new player and each commissioner inbox', async () => {
    const mailer = recordingMailer();
    const result = await sendSignupNotifications({
      mailer,
      user: { name: 'Pat Shortstop', email: 'pat@example.com' },
      notifyEmails: ['david@example.com', 'league@example.com'],
      publicAppUrl: 'https://oakdale-mens-softball.fly.dev',
    });
    expect(result).toEqual({ welcome: true, notified: ['david@example.com', 'league@example.com'] });
    expect(mailer.sent).toHaveLength(3);
    expect(mailer.sent[0].to).toBe('pat@example.com');
    expect(mailer.sent[0].subject).toMatch(/welcome/i);
    expect(mailer.sent[0].text).toContain('https://oakdale-mens-softball.fly.dev');
    expect(mailer.sent[1].to).toBe('david@example.com');
    expect(mailer.sent[1].subject).toBe('New player signup: Pat Shortstop');
    expect(mailer.sent[1].text).toContain('pat@example.com');
    expect(mailer.sent[2].to).toBe('league@example.com');
  });

  it('skips welcome mail for .local accounts and does not notify the signer-up', async () => {
    const mailer = recordingMailer();
    const result = await sendSignupNotifications({
      mailer,
      user: { name: 'Pat', email: 'pat@oakdale.local' },
      notifyEmails: ['david@example.com', 'pat@oakdale.local'],
      publicAppUrl: 'https://oakdale-mens-softball.fly.dev',
    });
    expect(result.welcome).toBe(false);
    expect(result.notified).toEqual(['david@example.com']);
    expect(mailer.sent).toHaveLength(1);
  });

  it('does nothing when mail is not configured', async () => {
    const mailer = createMailer({});
    const result = await sendSignupNotifications({
      mailer,
      user: { name: 'Pat', email: 'pat@example.com' },
      notifyEmails: ['david@example.com'],
      publicAppUrl: 'https://example.com',
    });
    expect(result).toEqual({ welcome: false, notified: [] });
  });

  it('escapes HTML in notify copy', () => {
    const mail = buildSignupNotifyEmail(
      { name: 'Pat <script>', email: 'pat@example.com' },
      'https://oakdale-mens-softball.fly.dev',
    );
    expect(mail.html).toContain('Pat &lt;script&gt;');
    expect(mail.html).not.toContain('<script>');
    expect(buildWelcomeEmail({ name: 'Pat', email: 'pat@example.com' }, 'https://x.test').html).toContain(
      'href="https://x.test"',
    );
  });
});
