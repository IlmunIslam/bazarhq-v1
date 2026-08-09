import nodemailer, { type Transporter } from 'nodemailer';
import type { Transport, EmailMessage, SendResult } from './transport';

/**
 * Gmail SMTP via a Google app password (§2.2) — the active transport.
 *
 * Why Gmail SMTP and not an ESP: mail genuinely originates from Google's
 * outbound infrastructure, so gmail.com's SPF authorises the sending IP and
 * Google DKIM-signs with d=gmail.com. Because the From domain is also
 * gmail.com, both identifiers align and DMARC passes. An ESP sending *from* a
 * @gmail.com address cannot align either identifier and gets filtered. For a
 * 10-minute login code the spam folder is total failure, not degradation.
 *
 * ── PORT: 465 vs 587 ────────────────────────────────────────────────────────
 * SMTP_PORT defaults to 465 (implicit TLS — the connection is encrypted from
 * the first byte). Some hosts block outbound 465; if Render's egress does, the
 * symptom is a connection timeout or ETIMEDOUT/ECONNREFUSED at send time, NOT
 * an auth error.
 *
 * Fallback, with no code change and no redeploy — in the Render dashboard set:
 *
 *     SMTP_PORT=587
 *
 * and restart. Port 587 uses STARTTLS: the connection opens in cleartext and is
 * upgraded before authentication. `secure` is derived from the port below, and
 * `requireTLS` is set for the 587 path so the upgrade is mandatory — the send
 * fails rather than silently transmitting the app password in the clear if a
 * middlebox strips the STARTTLS capability.
 *
 * Diagnose which ports are reachable from Render with the admin test-send
 * endpoint (POST /v1/admin/email/test-send) — it reports the transport error
 * verbatim.
 */

const DEFAULT_PORT = 465;

let _transporter: Transporter | null = null;

function smtpPort(): number {
  const raw = Number(process.env.SMTP_PORT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_PORT;
}

function fromHeader(): string {
  const name = process.env.SMTP_FROM_NAME ?? 'BazarHQ';
  const email = process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER ?? '';
  // Quoting the display name keeps a comma or period in it from splitting the
  // header into two addresses.
  return `"${name.replace(/"/g, '')}" <${email}>`;
}

function getTransporter(): Transporter {
  if (_transporter) return _transporter;

  const port = smtpPort();
  const implicitTls = port === 465;

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port,
    secure: implicitTls,
    // On 587 the session starts in cleartext; refuse to authenticate unless the
    // STARTTLS upgrade actually happens.
    requireTLS: !implicitTls,
    auth: {
      user: process.env.SMTP_USER ?? '',
      // Google app passwords are shown in 4 space-separated groups; the spaces
      // are display formatting and must not be sent.
      pass: (process.env.SMTP_PASS ?? '').replace(/\s+/g, ''),
    },
    // Fail fast rather than holding a request open on a blocked port.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return _transporter;
}

export const gmailSmtpTransport: Transport = {
  name: 'gmail-smtp',

  isConfigured(): boolean {
    return Boolean(
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      (process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER),
    );
  },

  async send(msg: EmailMessage): Promise<SendResult> {
    const from = fromHeader();
    const info = await getTransporter().sendMail({
      from,
      // Replies land in the platform inbox rather than bouncing off a noreply
      // address that does not exist (§2.2).
      replyTo: process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
    });

    return { messageId: info.messageId };
  },
};
