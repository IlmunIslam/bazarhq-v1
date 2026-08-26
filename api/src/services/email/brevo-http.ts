import type { Transport, EmailMessage, SendResult } from './transport';

/**
 * Brevo transactional email over HTTPS — the ACTIVE transport (§2.5).
 *
 * ── WHY HTTP AND NOT SMTP ───────────────────────────────────────────────────
 * Render's free tier blocks outbound SMTP entirely — ports 25, 465 and 587 —
 * effective September 2025, per Render's own changelog. That is the real reason
 * both 465 and 587 timed out from production; the port and IPv4 findings in
 * `gmail-smtp.ts` were correct and each fixed a genuine fault, they just
 * uncovered a wall no client-side fix can get past.
 *
 * This transport talks to Brevo's REST API on port 443, which is not blocked.
 * `gmail-smtp.ts` stays in the tree and becomes viable again on a paid instance
 * — switching back is `EMAIL_PROVIDER=smtp`, no code change.
 *
 * ── CONFIGURATION ───────────────────────────────────────────────────────────
 *     EMAIL_PROVIDER=brevo
 *     BREVO_API_KEY=<the v3 API key>
 *
 * The sender falls back to SMTP_FROM_EMAIL / SMTP_FROM_NAME, which are already
 * set to the verified single sender, so no re-entry is needed. BREVO_SENDER_EMAIL
 * / BREVO_SENDER_NAME override them if the two ever need to differ.
 *
 * The sender address must be a **verified sender** in Brevo. An unverified one
 * is rejected at send time, not at configuration time — see the error map below.
 */

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/**
 * Brevo has no published hard ceiling on request duration, and the OTP path is
 * in-band on a signup request. Fail fast rather than hold the request open.
 */
const REQUEST_TIMEOUT_MS = 15_000;

function senderEmail(): string {
  return process.env.BREVO_SENDER_EMAIL ?? process.env.SMTP_FROM_EMAIL ?? '';
}

function senderName(): string {
  return process.env.BREVO_SENDER_NAME ?? process.env.SMTP_FROM_NAME ?? 'BazarHQ';
}

interface BrevoErrorBody {
  code?: string;
  message?: string;
}

/**
 * Turns a non-2xx response into an error message that is worth reading in the
 * admin test-send read-out, which surfaces it verbatim.
 *
 * The `reason` codes on EmailUnavailableError are NOT decided here — `deliver()`
 * owns that, and every throw from a transport becomes `send_failed` (a missing
 * key becomes `unconfigured` earlier, via `isConfigured`). What this adds is the
 * one line that says which wall was hit:
 *
 *   401 unauthorized        — the API key is wrong, revoked, or absent from the
 *                             environment. Body: {"code":"unauthorized", ...}.
 *   400 invalid_parameter   — most often the SENDER is not verified in Brevo, or
 *                             the sender address does not match a verified one.
 *                             This is the failure that looks like a code bug and
 *                             is not: the payload is fine, the account is not.
 *   402 / not_enough_credits— the daily free allowance is spent at Brevo's end.
 *                             Our own counter should normally trip first.
 *   429                     — Brevo rate limit; back off and retry.
 */
function describeFailure(status: number, body: BrevoErrorBody | null, raw: string): string {
  const code = body?.code ?? '';
  const detail = body?.message ?? raw.slice(0, 300) ?? '';

  let hint = '';
  if (status === 401) {
    hint = ' — BREVO_API_KEY is missing, wrong or revoked';
  } else if (status === 400 && /sender/i.test(detail)) {
    hint = ` — the sender "${senderEmail()}" is probably not a verified sender in Brevo`;
  } else if (status === 402 || /credit/i.test(code)) {
    hint = " — Brevo's own send allowance is exhausted";
  } else if (status === 429) {
    hint = ' — Brevo rate limit';
  }

  return `Brevo HTTP ${status}${code ? ` (${code})` : ''}: ${detail}${hint}`;
}

export const brevoHttpTransport: Transport = {
  name: 'brevo-http',

  isConfigured(): boolean {
    return Boolean(process.env.BREVO_API_KEY && senderEmail());
  },

  async send(msg: EmailMessage): Promise<SendResult> {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) throw new Error('BREVO_API_KEY is not set');

    const from = senderEmail();
    if (!from) throw new Error('BREVO_SENDER_EMAIL / SMTP_FROM_EMAIL is not set');

    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: senderName(), email: from },
          to: [{ email: msg.to }],
          // Replies land in the platform inbox rather than bouncing off an
          // address nobody reads (§2.2).
          replyTo: { email: from, name: senderName() },
          subject: msg.subject,
          htmlContent: msg.html,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // fetch rejects only on transport-level faults: DNS, TLS, connection
      // reset, or our own abort. Name the timeout explicitly — otherwise it
      // surfaces as a bare "The operation was aborted".
      const e = err as Error;
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        throw new Error(`Brevo request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      }
      throw new Error(`Brevo request failed: ${e.message}`);
    }

    const raw = await res.text();
    let parsed: BrevoErrorBody & { messageId?: string; messageIds?: string[] } = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      // A non-JSON body is itself diagnostic (a proxy or error page); `raw`
      // carries it into the message below.
      parsed = {};
    }

    if (!res.ok) {
      throw new Error(describeFailure(res.status, parsed, raw));
    }

    // 201 with {"messageId":"<...@smtp-relay.mailin.fr>"} for a single
    // recipient; `messageIds` is the multi-recipient shape, which we never send.
    const messageId = parsed.messageId ?? parsed.messageIds?.[0] ?? '';
    return { messageId };
  },
};
