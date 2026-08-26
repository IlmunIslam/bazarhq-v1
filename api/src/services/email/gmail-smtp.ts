import { lookup } from 'dns/promises';
import { isIP } from 'net';
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
 * ── HOW THE WORKING CONFIGURATION WAS FOUND ─────────────────────────────────
 * Two separate faults on Render's egress had to be cleared, in order. Both were
 * found by deploying and reading the verbatim error off
 * POST /v1/admin/email/test-send:
 *
 *   1. Port 465 (implicit TLS) — connection timed out. Render blocks outbound
 *      465. The symptom was ETIMEDOUT at connect, never an auth error.
 *   2. Port 587 (STARTTLS) got past that, then failed with ENETUNREACH on
 *      2607:f8b0:400e:c02::6c:587 — Node had picked an AAAA record and Render's
 *      egress has no outbound IPv6 route.
 *
 * The working configuration is therefore **587 + a forced-IPv4 connection**.
 * Neither half is sufficient alone: on 465 the address family never matters
 * because the connection dies first, and on 587 an IPv6 address is unroutable.
 *
 * ── WHY THE HOST BELOW IS AN IP LITERAL ─────────────────────────────────────
 * Nodemailer does its own DNS resolution rather than delegating to net.connect.
 * `lib/shared/index.js#resolveHostname` resolves A *and* AAAA records,
 * concatenates them, and `formatDNSValue` picks one **at random**. On a v4-only
 * host that is a coin flip per connection, which is why the failure looked
 * intermittent.
 *
 * A `family: 4` option does NOT fix this. Verified against nodemailer 9.0.5:
 * `SMTPConnection#_connect` builds its socket options object from scratch
 * (port, host, allowInternalNetworkInterfaces, timeout, plus localAddress) and
 * never reads `options.family`, so the option is dropped before it could reach
 * net.connect. It is absent from the type definitions too.
 *
 * So we resolve the A record ourselves and hand nodemailer an IPv4 literal,
 * which short-circuits its resolver entirely. `tls.servername` is then set
 * explicitly so SNI and certificate verification still run against the real
 * hostname — without it Node would validate the certificate against the IP and
 * the handshake would fail. That covers both the implicit-TLS path (465) and
 * the STARTTLS upgrade (587); nodemailer merges `options.tls` into the socket
 * options on both.
 *
 * This is deliberately scoped to the SMTP socket. Calling
 * `dns.setDefaultResultOrder('ipv4first')` at startup would also work, but it is
 * process-global and would silently change resolution for Supabase, Cloudinary,
 * Upstash and everything else.
 *
 * ── PORT ────────────────────────────────────────────────────────────────────
 * SMTP_PORT defaults to 587 (STARTTLS) because that is what is reachable from
 * Render. `secure` is derived from the port, and `requireTLS` is set on the 587
 * path so the upgrade is mandatory — the send fails rather than silently
 * transmitting the app password in the clear if a middlebox strips the STARTTLS
 * capability. Setting SMTP_PORT=465 switches to implicit TLS with no code
 * change, for a host where 465 is open.
 */

const DEFAULT_PORT = 587;
const DEFAULT_HOST = 'smtp.gmail.com';

/**
 * How long a resolved A record is reused. Short enough that Google rotating an
 * address costs at most one failed send, long enough that a burst of OTPs does
 * not re-resolve per message.
 */
const DNS_TTL_MS = 5 * 60_000;

let _transporter: Transporter | null = null;
/** Identifies what `_transporter` was built for; a change rebuilds it. */
let _transporterKey = '';
let _dnsCache: { host: string; ip: string; expires: number } | null = null;

function smtpHost(): string {
  return process.env.SMTP_HOST ?? DEFAULT_HOST;
}

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

/**
 * The A record for `host`, cached for DNS_TTL_MS.
 *
 * `lookup` rather than `resolve4` so /etc/hosts and the platform resolver are
 * still honoured; `family: 4` here is load-bearing (unlike the nodemailer option
 * of the same name) because this call really does reach getaddrinfo.
 */
async function resolveIpv4(host: string): Promise<string> {
  const now = Date.now();
  if (_dnsCache && _dnsCache.host === host && _dnsCache.expires > now) {
    return _dnsCache.ip;
  }

  const { address } = await lookup(host, { family: 4 });
  _dnsCache = { host, ip: address, expires: now + DNS_TTL_MS };
  return address;
}

/** Drops the cached address and transporter so the next send re-resolves. */
function invalidateConnection(): void {
  _dnsCache = null;
  _transporter = null;
  _transporterKey = '';
}

async function getTransporter(): Promise<Transporter> {
  const host = smtpHost();
  const port = smtpPort();

  // An operator who pins SMTP_HOST to a literal address gets exactly that: do
  // not try to resolve it, and do not override SNI with an IP.
  const isLiteral = Boolean(isIP(host));
  const connectHost = isLiteral ? host : await resolveIpv4(host);

  const key = `${connectHost}:${port}`;
  if (_transporter && _transporterKey === key) return _transporter;

  const implicitTls = port === 465;

  _transporter = nodemailer.createTransport({
    // An IPv4 literal, so nodemailer's own A+AAAA resolver never runs.
    host: connectHost,
    port,
    secure: implicitTls,
    // On 587 the session starts in cleartext; refuse to authenticate unless the
    // STARTTLS upgrade actually happens.
    requireTLS: !implicitTls,
    // Because `host` is an address, SNI and certificate verification would
    // otherwise be attempted against it. Nodemailer merges `tls` into the socket
    // options on both the implicit-TLS and the STARTTLS path.
    tls: isLiteral ? {} : { servername: host },
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
  _transporterKey = key;

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
    const transporter = await getTransporter();

    try {
      const info = await transporter.sendMail({
        from,
        // Replies land in the platform inbox rather than bouncing off a noreply
        // address that does not exist (§2.2).
        replyTo: process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
      });

      return { messageId: info.messageId };
    } catch (err) {
      // The address is pinned for DNS_TTL_MS, so a dead one would otherwise be
      // reused for every send until it expired. Re-resolving on failure means a
      // retry gets a fresh address instead of repeating the same broken hop.
      invalidateConnection();
      throw err;
    }
  },
};

/** Test seam — lets a harness assert re-resolution without waiting out the TTL. */
export function __resetSmtpConnectionForTest(): void {
  invalidateConnection();
}
