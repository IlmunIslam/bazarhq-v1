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

| Key | Value |
|---|---|
| `EMAIL_PROVIDER` | `smtp` |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | the dedicated platform Gmail address |
| `SMTP_PASS` | the 16-character Google App Password |
| `SMTP_FROM_NAME` | `BazarHQ` |
| `SMTP_FROM_EMAIL` | same as `SMTP_USER` |
| `TRANSACTIONAL_EMAIL_ENABLED` | `false` |
| `EMAIL_DAILY_QUOTA` | *(optional — defaults to 450)* |

`RESEND_API_KEY` / `RESEND_FROM_EMAIL` stay declared and empty.

The app password may be pasted with or without Google's display spaces; they are
stripped before use. It is **not** scoped to sending — a leaked one also reads
the mailbox over IMAP. Dashboard only, never the repo, rotate on exposure.

## 3. Prove delivery from production

```
POST /v1/admin/email/test-send      { "to": "you@example.com" }
GET  /v1/admin/email/status
```

Admin-only, audit-logged (`EMAIL_TEST_SEND`, recipient hashed), capped at 10/hour.
It ignores `TRANSACTIONAL_EMAIL_ENABLED` — it is what proves the transport
*before* that flag is flipped.

`/email/status` returns provider, configured, port, today's quota usage, and the
last 20 send attempts. No secrets.

Definition of done (§2.7): a real message from `BazarHQ <…>` lands in **a Gmail
inbox and at least one non-Google inbox, not spam**, sent from production.

## 4. If port 465 is blocked from Render's egress

The symptom is a **connection timeout** (`ETIMEDOUT` / `ECONNREFUSED`) reported
verbatim by the test-send endpoint — not an auth error. A `535` is a credential
problem, not a port problem.

Fix without a code change or redeploy: set `SMTP_PORT=587` in the dashboard and
restart. The transport derives its TLS mode from the port — 465 is implicit TLS,
587 opens cleartext and upgrades via STARTTLS. `requireTLS` is set on the 587
path, so a stripped STARTTLS capability fails the send rather than transmitting
the app password in the clear.

## 5. The staged-rollout flag

`TRANSACTIONAL_EMAIL_ENABLED=false` suppresses four senders that have never
delivered a message in production: order confirmation, merchant new-order alert,
order status update, and merchant email verification. Without the gate they all
begin sending the moment the transport works, to real customers and merchants,
off the same 500/day quota the OTP path depends on.

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

Redis key `email:sent:<YYYY-MM-DD>` (UTC, 48h TTL), default limit 450 — under
Gmail's ~500 so the ceiling is ours and returns a clean `EMAIL_UNAVAILABLE`
rather than failing opaquely at Google's edge.

Reservation happens *before* the send, so concurrent sends cannot overshoot; a
failed send releases its reservation. If Redis is unavailable the counter is
disabled and sends proceed — an unreachable counter is not evidence of an
exhausted quota.

## 8. Switching to an ESP later

Buy a domain, verify it in Resend, then set `EMAIL_PROVIDER=resend`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`. No code change — `api/src/services/email/resend.ts`
is preserved and dormant. Note it must send from the **verified domain**; pointing
it at a `@gmail.com` address fails DMARC alignment, which is why Gmail SMTP is
the active transport today.
