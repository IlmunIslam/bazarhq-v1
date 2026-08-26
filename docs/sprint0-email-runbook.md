# Sprint 0 — Email transport runbook

Operational companion to `customer-accounts-plan.md` §2. Design rationale lives
there; this file is what you do, in order, and what to do when it breaks.

## 1. Apply the SQL first, then deploy

`api/prisma/sql/sprint0_email_sends.sql`, applied by hand in the Supabase SQL
editor. Nothing migrates on deploy (there is no `prisma/migrations` history and
`render.yaml` has no `preDeployCommand`).

Apply-then-deploy matters here: `email_sends` is written on every send. The write
is wrapped in a try/catch and cannot break a send, but deploying first means
every send logs an error until the table exists.

Rollback: `DROP TABLE "email_sends";` — nothing references it.

## 2. Environment variables (Render dashboard — all `sync: false`)

**Set these four.** Everything else already has the right value or a working
default.

| Key | Value |
|---|---|
| `EMAIL_PROVIDER` | `brevo` — **change from `smtp`** |
| `BREVO_API_KEY` | the Brevo v3 API key |
| `SMTP_FROM_EMAIL` | `bazarhq.platform@gmail.com` — must match the **verified sender** in Brevo |
| `SMTP_FROM_NAME` | `BazarHQ` |
| `TRANSACTIONAL_EMAIL_ENABLED` | `false` (leave it) |

`SMTP_FROM_*` are shared across transports, which is why the Brevo transport
reads them rather than duplicating the pair. `BREVO_SENDER_EMAIL` /
`BREVO_SENDER_NAME` override them and are only needed if the two must differ.

Optional: `EMAIL_DAILY_QUOTA` — defaults to **300**, Brevo's free allowance.

**Dormant, leave as they are.** `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` /
`SMTP_PASS` (unreachable from this plan — §4) and `RESEND_API_KEY` /
`RESEND_FROM_EMAIL` (needs a verified domain — §8).

The Brevo API key is a full-account credential, not a send-only scope. Dashboard
only, never the repo, rotate on exposure. The same is true of the Google App
Password still stored here: a leaked one also reads the mailbox over IMAP.

## 3. Prove delivery from production

```
POST /v1/admin/email/test-send      { "to": "you@example.com" }
GET  /v1/admin/email/status
```

Admin-only, audit-logged (`EMAIL_TEST_SEND`, recipient hashed), capped at 10/hour.
It ignores `TRANSACTIONAL_EMAIL_ENABLED` — it is what proves the transport
*before* that flag is flipped.

`/email/status` returns provider, configured, today's quota usage (§7 explains
the shape), and the last 20 send attempts. `smtpPort` is `null` unless the SMTP
transport is selected. No secrets.

Call `/email/status` **first** — a missing `BREVO_API_KEY` shows up as
`configured: false` there, before a send is spent finding out.

Definition of done (§2.7): a real message from `BazarHQ <…>` lands in **a Gmail
inbox and at least one non-Google inbox, not spam**, sent from production.

## 4. Why the transport is HTTP, and the SMTP history

**Render's free tier blocks outbound SMTP entirely — ports 25, 465 and 587 —
effective September 2025, per Render's own changelog.** No client-side fix
reaches past that. SMTP from a free instance is not viable, full stop.

Brevo's transactional API runs over HTTPS on 443, which is not blocked. That is
the whole reason the active transport is HTTP-based rather than SMTP.

### Diagnosing the Brevo transport

The test-send endpoint surfaces the transport error verbatim, and the status code
says which wall you hit:

| Symptom | Meaning | Fix |
|---|---|---|
| `Brevo HTTP 401 (unauthorized)` | `BREVO_API_KEY` missing, wrong, or revoked | re-enter the key |
| `Brevo HTTP 400 (invalid_parameter)` naming the sender | the sender is **not a verified sender** in Brevo | verify `bazarhq.platform@gmail.com` in Brevo, or point `BREVO_SENDER_EMAIL` at one that is |
| `Brevo HTTP 402` / credits | Brevo's own allowance is spent | wait for the daily reset; our counter should trip first |
| `Brevo HTTP 429` | Brevo rate limit | back off and retry |
| `Brevo request timed out after 15000ms` | network fault reaching api.brevo.com | retry; check Render egress |

The 400 is the one that looks like a code bug and is not — the payload is fine,
the *account* is not.

### History: the two SMTP faults (still true, still useful)

Kept because they are real findings, and they apply the moment SMTP becomes
reachable again — a paid Render instance, or any other host. Both were found by
reading the verbatim error off the test-send endpoint.

**Fault 1 — outbound 465 blocked.** Symptom: a connection timeout
(`ETIMEDOUT` / `ECONNREFUSED`) at connect, *not* an auth error. A `535` is a
credential problem, not a port problem. Fix: `SMTP_PORT=587`. The transport
derives its TLS mode from the port, and `requireTLS` is set on the 587 path, so a
stripped STARTTLS capability fails the send rather than transmitting the app
password in the clear.

**Fault 2 — no outbound IPv6 route.** With 587 the connection got further and
then failed with `ENETUNREACH` on `2607:f8b0:400e:c02::6c:587`. `smtp.gmail.com`
publishes both A and AAAA records; nodemailer resolves both, concatenates them,
and picks one **at random** per connection, so this looked intermittent. Fixed in
`gmail-smtp.ts`: it resolves the A record itself
(`dns.lookup(host, {family: 4})`) and hands nodemailer an IPv4 literal, with
`tls.servername` set so SNI and certificate verification still run against
`smtp.gmail.com`.

Two things that do *not* work, both checked:

- **`family: 4` on `createTransport`.** Nodemailer 9.0.5 builds its socket
  options from scratch in `SMTPConnection#_connect` and never reads
  `options.family`; it is not in the type definitions either. Silently ignored.
- **`dns.setDefaultResultOrder('ipv4first')` at startup.** It works, but it is
  process-global and would change resolution for Supabase, Cloudinary and
  Upstash too. Rejected as too broad for an SMTP problem.

So on a host that permits SMTP, the working Gmail configuration is **587 + forced
IPv4** — neither half is sufficient alone. Switching back is
`EMAIL_PROVIDER=smtp`, no code change; `gmail-smtp.ts` is intact and selectable.

## 5. The staged-rollout flag

`TRANSACTIONAL_EMAIL_ENABLED=false` suppresses four senders that have never
delivered a message in production: order confirmation, merchant new-order alert,
order status update, and merchant email verification. Without the gate they all
begin sending the moment the transport works, to real customers and merchants,
off the same 300/day quota the OTP path depends on.

**Not gated:** `sendPasswordResetEmail` (account recovery — gating it would
strand a locked-out merchant) and `sendOtpEmail` (the critical path the flag
exists to protect).

Flip to `true` deliberately, after OTP is proven.

## 6. Failure semantics — the asymmetry is intentional

| Sender | Unconfigured | Send fails |
|---|---|---|
| `sendVerificationEmail`, `sendPasswordResetEmail` | returns quietly | **throws** |
| the three order senders | returns quietly | logs, returns |
| `sendOtpEmail` | **throws** | **throws** |

The first two rows reproduce pre-Sprint-0 behaviour exactly — `orders.ts`'s
fire-and-forget callers depend on it.

`sendOtpEmail` inverts it (§2.6). Call it **inside** the transaction that creates
the OTP challenge so a throw rolls the challenge row back, and map
`EmailUnavailableError` to `503 EMAIL_UNAVAILABLE`. A signup that reports success
while no code was sent is the failure mode this exists to prevent.

The OTP code is never written to a log, a console path, or the `email_sends` row.

## 7. Quota guard

Redis key `email:sent:<YYYY-MM-DD>` (UTC, 48h TTL), default limit **300** —
Brevo's free transactional allowance, so our counter trips with a clean
`EMAIL_UNAVAILABLE` before Brevo refuses with a credits error.

Reservation happens *before* the send, so concurrent sends cannot overshoot; a
failed send releases its reservation. If Redis is unavailable the counter is
disabled and sends proceed — an unreachable counter is not evidence of an
exhausted quota.

Reading it: `/email/status` returns

```
quota: { sent, limit, remaining, available, counter }
```

`available` means **a send would get through right now** (`sent < limit`).
`counter` says whether `sent` can be trusted — `redis` (counted),
`not-configured` (no `UPSTASH_REDIS_*`), or `error` (Redis unreachable). Under
the last two, `sent` and `remaining` are `null` — unknown, not zero — and
`available` is `true`, because an unenforced quota lets every send through.

**`counter` being anything but `redis` in production is a finding in itself:**
the quota is not being enforced, and the same Redis backs brute-force lockout and
the rate limiters.

## 8. Three swappable providers

`EMAIL_PROVIDER` selects one; every sender goes through `deliver()` and never
touches a provider client directly, so switching is config, not a rewrite.

| Value | Module | State | Needs |
|---|---|---|---|
| `brevo` | `brevo-http.ts` | **ACTIVE** | `BREVO_API_KEY` + a verified sender |
| `smtp` | `gmail-smtp.ts` | dormant | a host that permits outbound SMTP (§4) |
| `resend` | `resend.ts` | dormant | a domain verified in Resend |

Only the selected module is ever `require`d, so a dormant provider's client is
never constructed and its credentials are never read.

On Resend: it must send from the **verified domain**. Pointing
`RESEND_FROM_EMAIL` at a `@gmail.com` address fails DMARC alignment — the
original reason Gmail SMTP was chosen over an ESP. Brevo sidesteps this with a
verified *single sender*, which authenticates the one address rather than a
domain.
