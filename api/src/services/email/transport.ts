import { createHash } from 'crypto';
import { getRedis } from '../../lib/redis';
import { prisma } from '../../lib/prisma';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface SendResult {
  messageId: string;
}

/**
 * A transport is the wire underneath the senders. Swapping providers (§2.5) is a
 * config change — set EMAIL_PROVIDER — not a rewrite: every sender in index.ts
 * hands a message to `deliver()` and never touches a provider SDK directly.
 */
export interface Transport {
  readonly name: string;
  /** False when the credentials this transport needs are absent from the env. */
  isConfigured(): boolean;
  send(msg: EmailMessage): Promise<SendResult>;
}

/**
 * Thrown ONLY on the OTP path (§2.6). Routes map this to 503 EMAIL_UNAVAILABLE.
 * The five legacy senders never surface it — they stay best-effort.
 */
export class EmailUnavailableError extends Error {
  readonly reason: 'unconfigured' | 'quota_exhausted' | 'send_failed';

  constructor(reason: 'unconfigured' | 'quota_exhausted' | 'send_failed', message: string) {
    super(message);
    this.name = 'EmailUnavailableError';
    this.reason = reason;
  }
}

// ─── Provider selection ───────────────────────────────────────────────────────

let _transport: Transport | null = null;

/**
 * Selects the transport from EMAIL_PROVIDER, defaulting to "brevo".
 *
 *   "brevo"  — Brevo transactional API over HTTPS. ACTIVE. The only one that
 *              works from Render's free tier, which blocks outbound SMTP
 *              entirely (ports 25/465/587, since Sept 2025).
 *   "smtp"   — Gmail SMTP. Dormant here, viable on a paid instance.
 *   "resend" — dormant, needs a verified domain.
 *
 * Each module is required lazily, so the dormant providers' clients are never
 * constructed and their credentials are never read (§2.5).
 */
export function getTransport(): Transport {
  if (_transport) return _transport;

  const provider = (process.env.EMAIL_PROVIDER ?? 'brevo').trim().toLowerCase();

  if (provider === 'resend') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _transport = require('./resend').resendTransport as Transport;
  } else if (provider === 'smtp') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _transport = require('./gmail-smtp').gmailSmtpTransport as Transport;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _transport = require('./brevo-http').brevoHttpTransport as Transport;
  }

  return _transport;
}

/** Test seam — lets a future test swap the transport without env juggling. */
export function __setTransportForTest(t: Transport | null): void {
  _transport = t;
}

// ─── Daily quota counter (§2.4) ───────────────────────────────────────────────

/**
 * Brevo's free plan allows 300 transactional emails/day. The counter matches it
 * exactly rather than stopping short: unlike Gmail's ~500 — where overshooting
 * costs account reputation — Brevo simply refuses with a credits error, so
 * there is nothing to buy headroom against.
 *
 * Set EMAIL_DAILY_QUOTA to override (a paid Brevo plan, or 450 when running the
 * Gmail SMTP transport on a paid instance).
 */
const DEFAULT_DAILY_QUOTA = 300;

function dailyQuota(): number {
  const raw = Number(process.env.EMAIL_DAILY_QUOTA);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_DAILY_QUOTA;
}

/** UTC day — matches the key format in the plan: email:sent:<YYYY-MM-DD>. */
function quotaKey(now = new Date()): string {
  return `email:sent:${now.toISOString().slice(0, 10)}`;
}

/**
 * Reserves one send against today's quota, returning false when exhausted.
 *
 * Reserve-before-send (rather than count-after) is deliberate: it is the only
 * ordering where concurrent sends cannot overshoot the cap. A failed send
 * releases its reservation via `releaseQuota`.
 *
 * When Redis is absent (local dev) the counter is disabled and sends proceed —
 * an unavailable counter is not evidence of an exhausted quota, and failing
 * closed here would make the whole app undeliverable without Upstash.
 */
async function reserveQuota(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;

  try {
    const key = quotaKey();
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 48 * 60 * 60);
    return count <= dailyQuota();
  } catch (err) {
    console.error('[email] quota check failed, allowing send:', (err as Error).message);
    return true;
  }
}

async function releaseQuota(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.decr(quotaKey());
  } catch {
    // A stranded reservation costs one send from today's budget. Never fatal.
  }
}

export interface QuotaUsage {
  /** Sends counted today, or null when the counter could not be read. */
  sent: number | null;
  limit: number;
  /** Headroom left today, or null when unknown. */
  remaining: number | null;
  /** Whether another send would be allowed through right now. */
  available: boolean;
  /** Why `sent` is or is not trustworthy. */
  counter: 'redis' | 'not-configured' | 'error';
}

/**
 * Current usage — powers the admin quota read-out.
 *
 * `available` answers "would the next send get through", which is what a reader
 * sitting next to `sent` and `limit` takes it to mean. It previously reported
 * whether *Redis* was reachable, so a healthy, completely unused quota rendered
 * as `{ sent: 0, limit: 450, available: false }` — which reads as "exhausted at
 * zero sends". That is the bug.
 *
 * The Redis-reachability signal is real and worth keeping, so it moved to
 * `counter` rather than being dropped. Note the two disagree on purpose: with no
 * counter, `reserveQuota` lets every send through (an unreachable counter is not
 * evidence of an exhausted quota), so the honest report is `available: true`
 * with `counter: 'not-configured'` and `sent: null` — unknown, not zero.
 *
 * `counter` being anything but 'redis' in production is itself a finding: the
 * quota is unenforced, and the same Redis backs brute-force lockout and rate
 * limiting.
 */
export async function getQuotaUsage(): Promise<QuotaUsage> {
  const limit = dailyQuota();
  const redis = getRedis();

  // Quota unenforced ⇒ sends proceed ⇒ available.
  if (!redis) {
    return { sent: null, limit, remaining: null, available: true, counter: 'not-configured' };
  }

  try {
    const raw = await redis.get<number | string>(quotaKey());
    const parsed = raw == null ? 0 : Number(raw);
    const sent = Number.isFinite(parsed) ? parsed : 0;
    return {
      sent,
      limit,
      remaining: Math.max(0, limit - sent),
      available: sent < limit,
      counter: 'redis',
    };
  } catch {
    // reserveQuota swallows the same failure and allows the send.
    return { sent: null, limit, remaining: null, available: true, counter: 'error' };
  }
}

// ─── Send log (§7.6) ──────────────────────────────────────────────────────────

/**
 * Hash of the recipient, never the address itself (§7.6).
 *
 * Caveat worth knowing: an email address is low-entropy, so this is a
 * correlation key that resists casual disclosure — not a one-way seal against
 * someone testing a known address. Do not treat it as anonymisation.
 */
export function hashEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

/**
 * Records the attempt. Gmail SMTP publishes no delivery webhooks, so this table
 * is the only programmatic record that a send was accepted (§2.4). Logging must
 * never be able to fail a send, hence the swallow — same contract as audit.ts.
 */
async function logSend(entry: {
  to: string;
  template: string;
  status: 'sent' | 'failed';
  providerMessageId?: string | null;
  error?: string | null;
}): Promise<void> {
  try {
    await prisma.emailSend.create({
      data: {
        toEmailHash: hashEmail(entry.to),
        template: entry.template,
        status: entry.status,
        providerMessageId: entry.providerMessageId ?? null,
        // Truncated: provider errors can carry multi-KB SMTP dialogue.
        error: entry.error ? entry.error.slice(0, 500) : null,
      },
    });
  } catch (err) {
    console.error('[email] send-log write failed:', (err as Error).message);
  }
}

// ─── The single funnel every sender goes through ──────────────────────────────

/**
 * These two are independent because the pre-Sprint-0 senders were not uniform,
 * and §2.5 requires their semantics survive byte-for-byte:
 *
 *   sendVerificationEmail / sendPasswordResetEmail — returned quietly when the
 *     transport was unconfigured, but let a real send error propagate to the
 *     caller (no .catch()).
 *   the three order senders — swallowed both (.catch(console.error)).
 *   sendOtpEmail (new, §2.6) — throws on both.
 *
 * Collapsing them into one flag would silently change one group or the other.
 */
export interface DeliverOptions {
  /** Throw when the transport has no credentials. */
  throwOnUnconfigured?: boolean;
  /** Throw when the send itself fails, or the daily quota is exhausted. */
  throwOnFailure?: boolean;
}

/**
 * Quota reservation → transport send → send-log write.
 *
 * Returns the messageId on success, or null on a failure the caller opted to
 * tolerate. Callers that pass neither flag can never see it reject — the
 * fire-and-forget paths in orders.ts depend on that.
 */
export async function deliver(
  template: string,
  msg: EmailMessage,
  opts: DeliverOptions = {},
): Promise<string | null> {
  const { throwOnUnconfigured = false, throwOnFailure = false } = opts;
  const transport = getTransport();

  if (!transport.isConfigured()) {
    const message = `transport "${transport.name}" is not configured`;
    if (throwOnUnconfigured) {
      throw new EmailUnavailableError('unconfigured', message);
    }
    console.log(`[DEV] ${template} → ${msg.to} (not sent — ${message})`);
    return null;
  }

  if (!(await reserveQuota())) {
    const message = `daily send quota (${dailyQuota()}) exhausted`;
    await logSend({ to: msg.to, template, status: 'failed', error: message });
    if (throwOnFailure) {
      throw new EmailUnavailableError('quota_exhausted', message);
    }
    console.error(`[email] ${template} → dropped: ${message}`);
    return null;
  }

  try {
    const { messageId } = await transport.send(msg);
    await logSend({ to: msg.to, template, status: 'sent', providerMessageId: messageId });
    return messageId;
  } catch (err) {
    const message = (err as Error).message;
    await releaseQuota();
    await logSend({ to: msg.to, template, status: 'failed', error: message });
    if (throwOnFailure) {
      throw new EmailUnavailableError('send_failed', message);
    }
    console.error(`[email] ${template} failed:`, message);
    return null;
  }
}
