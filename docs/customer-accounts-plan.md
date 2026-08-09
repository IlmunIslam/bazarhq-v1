# Customer Accounts, Email OTP Verification, Consent & Customer Visibility — Design Document

> Status: **design only / nothing built**. No code, no migrations, no installs, no email sent
> in producing this document.
>
> Scope rule for this phase: **strictly additive**. No existing column is dropped, renamed or
> retyped; no existing endpoint changes its contract; guest checkout keeps working end to end
> for the whole phase. Every place that breaks that rule is called out explicitly in
> [§12 Risk register](#12-risk-register--what-touches-production).

### Settled decisions (recorded, not re-litigated)

1. **The gate is at CHECKOUT, not add-to-cart.** Customers browse and fill carts freely; an
   account is required to *place an order*.
2. **Guest checkout keeps working for this entire phase.** Strictly additive. Accounts become the
   primary/encouraged path at checkout; guest remains the secondary option, present and
   functional. **Whether to retire guest checkout is a later, separate decision — out of scope
   here.**
3. **Email goes out via Gmail SMTP with an app password**, From display name `BazarHQ`. The
   Resend + verified-domain path is **off** — no domain purchase right now. Resend code stays in
   the tree, intact and dormant, behind a swappable transport so a future domain is a config
   change. See [§2](#2-email--gmail-smtp).
4. **Google Sign-In is a later sprint, WEB ONLY.** Mobile customers register with email + OTP.
   See [§6](#6-google-sign-in--web-only-later-sprint).
5. Both **web** (`frontend/`) and **mobile** (`mobile/`) are in scope.

---

## 0. Executive summary

Three findings dominate the plan, and two of them are gating.

**Finding A — customer "accounts" already exist, and the login is an authentication bypass.**
`api/src/routes/customer.ts` is live at `/v1/customer` and issues a **30-day customer JWT to
anyone who types a phone number that has ever placed an order** — no password, no OTP, no proof
of possession. That token then reads that person's *cross-shop* order history and saved
addresses. Bangladeshi mobile numbers are an 11-digit space with a known `01[3-9]` prefix; a
merchant who has one order from a customer can read that customer's orders at *every other shop*.
This is not a feature to extend — it is a hole to close, and this phase is what makes closing it
possible. **Re-verified at time of writing: `customer.ts:31-44` is unchanged and still live.**
Details in [§1](#1-what-already-exists-customer-side).

**Finding B — transactional email has never run in production, and the fix is now Gmail SMTP.**
The Resend integration is fully coded (`api/src/services/email.ts`, 5 templates,
`resend@^3.3.0` installed) but has never sent a message: the local API key is empty, and
`RESEND_FROM_EMAIL` defaults to `noreply@bazarhq.com` — a domain we do not own and cannot verify.
Rather than block the phase on a domain purchase, **email now goes through Gmail SMTP on a
personal Google account**, which sidesteps domain verification entirely *and* gets better
inbox placement than an ESP could achieve from a `@gmail.com` From address. Rationale, limits and
guards in [§2](#2-email--gmail-smtp). Email is still the hard dependency of everything else, so
proving it end to end is still Sprint 0.

**Finding C — the additive linkage is already half-built, and mobile checkout does not exist.**
`Order.customerId` already exists in the schema as a nullable column commented `// null = guest
order` — and **no code path anywhere reads or writes it**. It is exactly the
`products.global_category_id` shape from C0, already poured. Meanwhile mobile has a cart but its
checkout is a disabled placeholder (`mobile/.../cart.tsx:120` — "Checkout coming soon"), so
mobile is not "add a gate to checkout", it is "build checkout". That is real scope, and it lands
late in the plan.

Recommended shape: a **new `Customer` model** separate from `User` (which is merchant-only and
carries a `Shop?` relation), **password login with signup-time email OTP** plus **Google Sign-In
on web as a later, pre-verified path**, sessions folded into the **existing `sessions` table** via
a nullable `customer_id`, and consent stored as an **append-only record** referencing a policy
version whose text lives in git.

---

## 1. What already exists (customer side)

### 1.1 Mounted and live

`api/src/index.ts:24,104` mounts `customerRoutes` at `/v1/customer`. The full surface of
`api/src/routes/customer.ts`:

| Endpoint | Auth | What it does today |
|---|---|---|
| `POST /v1/customer/auth/login` | none | Takes `{ phone }`. If **any order exists with that phone**, mints a 30-day customer JWT. |
| `POST /v1/customer/auth/logout` | none | Clears the `customerToken` cookie. |
| `GET /v1/customer/me` | `requireCustomer` | Reconstructs a "profile" by reading `customerName`/`customerEmail` off the newest order. |
| `GET /v1/customer/orders` | `requireCustomer` | Cursor-paginated order history **across all shops**, keyed by phone. |
| `GET/POST/PATCH/DELETE /v1/customer/addresses[/:id]` | `requireCustomer` | `SavedAddress` CRUD, max 3, default-address handling. |

Web UI exists at `frontend/app/sites/[shop]/account/login/page.tsx` ("Enter the phone number you
used when placing your order") and `.../account/page.tsx`.

### 1.2 What does **not** exist

- **No customer model.** `User` (`schema.prisma:13`) is merchants-only — it owns `shop Shop?`
  with `UNIQUE(user_id)` on shops, and `POST /v1/auth/register` always creates a merchant. There
  is no row anywhere that represents a customer as an entity.
- **No customer identity at all.** A "customer" is a `String` phone number, reconstructed on
  every request by querying the orders table. `SavedAddress.customerId` (`schema.prisma:483`)
  literally stores **a phone number**, not an id — see `customer.ts:110,138`.
- **No credential.** No password, no OTP, no token, no email verification. Nothing is proven.
- **No session row.** `customer.ts:41-42` says so out loud: `// No session row for customers in
  demo (stateless JWT)`, and it discards the `jti`. Consequently `requireCustomer`
  (`middleware/auth.ts:74-89`) is the **only** one of the three guards that does *not* check
  `prisma.session` for revocation — compare `requireMerchant:27` and `requireAdmin:48`. **Customer
  tokens are irrevocable for their full 30 days.** Logout clears the cookie; the token stays valid.
- **No consent record, no privacy policy, no terms page.** A repo-wide grep across
  `frontend/app`, `frontend/lib`, and `mobile/src` for privacy/terms returns nothing.
- **`optionalCustomer`** (`middleware/auth.ts:91`) is defined but **mounted on zero routes**.
  Checkout is fully anonymous today.

### 1.3 The security assessment, stated plainly

The current `POST /v1/customer/auth/login` is an **authentication bypass, not weak
authentication**. Knowledge of a phone number that has transacted is the sole requirement, and
the resulting token grants cross-shop read access to order history and saved delivery addresses
(name, phone, full address). Under the consent/privacy regime this phase is meant to satisfy,
that is also a disclosure exposure, not just a security one.

**Current status: still present.** `git log` shows no change to `customer.ts`, and the handler at
`customer.ts:31-44` is byte-for-byte as described. It has **not** been fixed separately.

**It is in scope for this phase to remove it**, and that removal is the one deliberate
non-additive act in the plan. It is deferred to Sprint 6 so that real accounts exist first — see
[§11](#11-staging--sprint-plan) and [§12](#12-risk-register--what-touches-production).

### 1.4 Verdict: extend or duplicate?

**Extend the surface, replace the identity.** Keep the URL space (`/v1/customer/**`), keep the
addresses and orders endpoints and their shapes, keep the web account pages. Replace what `sub`
in the JWT *means* — from "a phone string" to "a `customers.id` UUID" — and give it a credential.
The address and order-history handlers change one line each (the `where` clause); their response
envelopes do not change.

---

## 2. Email — Gmail SMTP

> **Decision recorded:** no domain purchase right now, so the Resend + verified-domain path is
> **off**. Mail is sent through **Gmail SMTP using a Google app password**, with the From display
> name set to `BazarHQ` — recipients see **`BazarHQ <bazarhq.platform@gmail.com>`**.

### 2.1 What exists in the tree today

- **`resend@^3.3.0`** is a declared dependency (`api/package.json:40`) — installed.
- **`api/src/services/email.ts`** is complete: `sendVerificationEmail`, `sendPasswordResetEmail`,
  `sendOrderConfirmation`, `sendMerchantNewOrder`, `sendOrderStatusUpdate`, with HTML templates,
  BDT money formatting, and tracking links. **All of this is reusable as-is** — only the
  transport underneath changes.
- **Already wired into live flows**: merchant register (`auth.ts:64`), forgot-password
  (`auth.ts:214`), guest order placed (`orders.ts:228,230`), order status change (`orders.ts:375`).
- **Nothing has ever been delivered.** Local `RESEND_API_KEY` is empty (verified: length 0);
  `render.yaml:53-57` declares the vars `sync: false` so they must be typed into the dashboard by
  hand. Corroborating evidence: `POST /v1/admin/merchants/:id/verify-email` (`admin.ts:382-409`)
  exists solely so a superadmin can flip `emailVerified` manually, and `auth.ts:126` hard-blocks
  unverified merchant logins — that override is load-bearing precisely because no mail arrives.
- **`nodemailer` is not installed** (verified). Adding it is a build task, not a design task.

### 2.2 The Gmail SMTP configuration

| Setting | Value |
|---|---|
| Host | `smtp.gmail.com` |
| Port | `465` (implicit TLS) — or `587` with STARTTLS if 465 is blocked from Render |
| Auth user | `bazarhq.platform@gmail.com` |
| Auth pass | **Google App Password** (16 characters) — requires 2-Step Verification enabled on the account first |
| From header | `"BazarHQ" <bazarhq.platform@gmail.com>` |
| Reply-To | the same address (replies land in that inbox — see §2.4) |
| Library | `nodemailer` (+ `@types/nodemailer`) — **not yet installed** |

New environment variables, all `sync: false` in `render.yaml` (they must be entered by hand in the
Render dashboard — a push will not carry them):

```
EMAIL_PROVIDER=smtp          # "smtp" | "resend"  — selects the transport (§2.5)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=bazarhq.platform@gmail.com
SMTP_PASS=<google app password>
SMTP_FROM_NAME=BazarHQ
SMTP_FROM_EMAIL=bazarhq.platform@gmail.com
```

`RESEND_API_KEY` / `RESEND_FROM_EMAIL` stay declared and stay empty. Nothing is deleted.

### 2.3 Why Gmail SMTP beats an ESP here — the deliverability argument

This is the rationale to carry forward, because it is not obvious and it is the whole reason for
the choice:

**Mail sent through Gmail SMTP genuinely originates from Google's outbound infrastructure.** The
sending IP is Google's, so `gmail.com`'s SPF record authorises it; Google DKIM-signs the message
with `d=gmail.com`; and because the `From:` domain is also `gmail.com`, **DKIM and SPF are
aligned with the From domain, so DMARC passes cleanly**. Receiving mail servers see a message
that is fully authenticated and consistent, and it lands in the inbox.

**A third-party ESP sending *From* a `@gmail.com` address fails that alignment.** Its IPs are not
in gmail.com's SPF record, and it can only DKIM-sign with its *own* domain, so neither identifier
aligns with the From domain and **DMARC alignment fails**. The message looks, to a receiver,
exactly like someone forging a Gmail address — and gets filtered accordingly. (In practice
Resend will refuse to send from an unverified domain at all, so this is moot with Resend
specifically; the alignment principle is what generalises to *any* ESP.)

**For a time-sensitive login code, the spam folder is a total failure**, not a degradation. The
code expires in 10 minutes; a customer who has to go hunting for it abandons signup. Inbox
placement is therefore the dominant requirement, and Gmail SMTP is the option that gets it
without owning a domain.

The moment a real domain exists, the calculus flips — an ESP with a verified domain gives better
volume, bounce webhooks and reputation isolation. §2.5 is designed so that is a config change.

### 2.4 Limits, risks, and the guards they imply

| Limit / risk | Reality | Guard |
|---|---|---|
| **~500 recipients/day** on a free `@gmail.com` account (Workspace is ~2,000) | Fine at OTP volumes — a signup is 1 message. 500/day is hundreds of signups plus order mail. | Add a **global daily send counter** in Redis. On exhaustion, OTP sends return `EMAIL_UNAVAILABLE` (§2.6) rather than silently failing at Google's edge. The per-email (3/15min) and per-IP (10/10min) caps in §5.1 double as a spend cap on this quota. |
| **Google may lock or suspend the account** if traffic looks spammy | Accepted risk at this volume. A lock takes down *all* platform mail. | Keep volume low; never send bulk/marketing through it (marketing email stays out of scope until a domain exists). Monitor the send log (§7.6). |
| **The app password is broad** | A Google app password is not scoped per-protocol — a leaked one can also read the mailbox over IMAP, not just send. | Store **only** in Render env (`sync: false`), never in the repo or a committed `.env`. Rotate immediately if exposed. **Adopted in Sprint 0: a dedicated account (`bazarhq.platform@gmail.com`), not a personal one** — same zero cost, and it caps the blast radius of a leak to an otherwise-empty mailbox. |
| **No delivery webhooks** | Gmail SMTP gives no programmatic bounce/complaint feedback; bounces arrive as bounce-back messages in the inbox. | This makes the `email_sends` log (§7.6) more valuable, not less — it is the only record that a send was accepted. Promote it from "optional" to **recommended**. |
| **Sender identity is a `gmail.com` address** | Recipients see `BazarHQ <bazarhq.platform@gmail.com>`. Looks less established than `noreply@<domain>`. | Accepted, explicitly, as the cost of not buying a domain. The display name carries the brand. Revisit with §2.5's swap. |

### 2.5 A swappable transport (Resend kept intact and dormant)

The requirement is that a future domain purchase is a **config swap, not a rewrite**. Design:

```
api/src/services/email/
  index.ts        — the five existing senders + the new sendOtpEmail; unchanged templates
  transport.ts    — interface Transport { send(msg): Promise<{ messageId: string }> }
                    selects an implementation from EMAIL_PROVIDER
  gmail-smtp.ts   — nodemailer transport (the active one)
  resend.ts       — the existing Resend client call, moved verbatim, dormant
```

Rules:

- **The five existing senders keep their exact failure semantics** — best-effort, catch-and-log,
  never block a response (`orders.ts` relies on this with its fire-and-forget `void (async …)`).
  Only the transport they hand a message to changes.
- **Their public signatures do not change**, so `auth.ts`, `orders.ts` and every other caller is
  untouched.
- **The Resend code is preserved, not deleted.** With `EMAIL_PROVIDER=smtp` it is simply never
  constructed. Switching later = set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`,
  `RESEND_FROM_EMAIL`, redeploy. No code change.
- The templates in the current `email.ts` are transport-agnostic HTML strings and move across
  unmodified.

### 2.6 The OTP sender MUST throw — carried forward, non-negotiable

Today `getClient()` (`email.ts:51-54`) returns `null` when unconfigured, and **every caller then
`console.log`s and returns normally**. Nothing throws, nothing 500s, no metric moves. The system
reports success while sending nothing.

For order receipts that is acceptable. **For OTP it is the worst possible failure mode: a signup
that appears to succeed while no code was ever sent.** The customer sits on a code-entry screen
waiting for mail that does not exist, with no error to act on.

Therefore `sendOtpEmail()` is a **separate function with inverted semantics**:

- **Transport unconfigured** (`SMTP_PASS` missing) → **do not create the OTP challenge**; return
  `503 EMAIL_UNAVAILABLE`, "Email verification is temporarily unavailable. Please try again
  shortly."
- **SMTP send fails or the daily quota is exhausted** → same, **and roll back the challenge row**
  in the same transaction, so a failure the user did not cause does not burn their 3-per-15-min
  send allowance.
- **Success** → record the `messageId` (§7.6) so "I never got the code" is diagnosable.
- **Never log the code itself**, including in any `[DEV]` console path.

> **The five existing senders' behaviour is explicitly left untouched.** They keep swallowing
> errors. Only the OTP path throws.

### 2.7 Definition of done for Sprint 0

Verifiable in production, before anything else is built:

1. 2-Step Verification enabled on the Google account; app password generated.
2. `nodemailer` installed; transport layer per §2.5; `EMAIL_PROVIDER=smtp` and the six SMTP vars
   set in the **Render dashboard**; redeployed.
3. Port 465 confirmed reachable from Render's egress (fall back to 587/STARTTLS if not — worth
   testing early, some hosts block 465).
4. A real message from **`BazarHQ <bazarhq.platform@gmail.com>`** lands in a **Gmail inbox and at
   least one non-Google inbox — not spam** — sent from production Render.
5. A deliberately-broken `SMTP_PASS` produces a loud `EMAIL_UNAVAILABLE`, not a silent success.
6. The daily-quota counter increments and, when forced past its limit, fails closed.

> ⚠️ **Side effect to expect:** the moment the transport works, the **five existing senders start
> actually delivering** — order confirmations, merchant new-order alerts, status updates,
> merchant verification links. These have never sent a message in production. Real customers and
> merchants will begin receiving mail they have never received before, and it consumes the same
> 500/day quota. This is desirable (it is what the code was always for) but it is a **visible
> change to live behaviour** and is logged in [§12](#12-risk-register--what-touches-production).
> If you would rather stage it, gate the four order/merchant senders behind a
> `TRANSACTIONAL_EMAIL_ENABLED` flag in Sprint 0 and flip it after the OTP path is proven.

---

## 3. The order model, and how accounts link to it additively

### 3.1 What an order stores today

`Order` (`schema.prisma:335-364`) keeps a **customer snapshot**, deliberately denormalised so it
never changes if a profile is edited:

| Column | Type | Notes |
|---|---|---|
| `customer_name` | `String` **NOT NULL** | required at checkout |
| `customer_phone` | `String` **NOT NULL** | `^01[3-9]\d{8}$`, the de-facto identity today |
| `customer_email` | `String?` | **optional** — checkout labels it "Email (optional)" |
| `shipping_address` | `Json` NOT NULL | `{ line1, line2?, city, district }` |
| `customer_id` | `String?` | **already exists**, commented `// null = guest order` |

`POST /v1/orders/guest` (`orders.ts:60`) writes all of these **except `customer_id`**, which it
never sets.

### 3.2 `orders.customer_id` — already poured, never used

Verified by grep across `api/src`: the only `customerId` references are in `customer.ts`, and
every one of them is `SavedAddress.customerId` (holding a phone). **`Order.customerId` is read by
nothing and written by nothing.** The column exists in the schema, is nullable, has no default,
no foreign key, and no index.

This is the `products.global_category_id` pattern from C0, with the column already in place:

- **Existing guest orders**: `customer_id` stays `NULL` forever. Every current query is
  unaffected — none of them mention the column.
- **New account orders**: `customer_id` = `customers.id`. The snapshot columns are **still
  written**, exactly as today, from the account's profile/address. An order never depends on the
  account row to render.
- **Guest orders keep working unchanged** because the guest path simply keeps not setting it.

**Confirmed additive.** The only DDL needed is: add a foreign key to `customers(id)`, and add an
index for "this customer's orders at this shop". Both are new constraints on a column that is
100% `NULL`, so validation is instant. (Belt and braces at any future scale: `ADD CONSTRAINT …
NOT VALID` then `VALIDATE CONSTRAINT` in a second statement, to avoid an `ACCESS EXCLUSIVE` lock
during the scan. At current row counts it's academic.)

### 3.3 The `saved_addresses.customer_id` collision — handle deliberately

`saved_addresses.customer_id` currently holds **phone numbers**, written by `customer.ts:138`. If
customer UUIDs start landing in that same column you get two incompatible key spaces in one
column, with no way to tell them apart — the exact ambiguity C0 avoided by adding
`global_category_id` beside `category_id` instead of overloading it.

**Do the same here.** Add a new nullable `customer_account_id` column; leave `customer_id` and
its rows untouched. During the transition, reads resolve by `customer_account_id` first and may
optionally fall back to the phone key for a customer whose verified phone matches. Legacy rows
are never rewritten, so nothing can break. Whether to ever backfill is a later decision — the
same bucket as "retire guest checkout".

### 3.4 Claiming past guest orders

Tempting: "on signup, attach every past order with this phone/email to the new account." **Do not
do this automatically.** Phone reuse is common in Bangladesh, an unverified phone proves nothing,
and an incorrect claim discloses a stranger's name and home address — the precise failure mode of
Finding A. Explicitly **out of scope for this phase**; if wanted later it needs a verified phone
(SMS OTP via SSL Wireless, already a project dependency) plus per-order confirmation.

---

## 4. Existing auth patterns — customer auth must follow them

There are currently two realms, and they are consistent. Customer becomes the third by
**following the same shape**, not inventing one.

### 4.1 The shared mechanics

- **JWT, HS256, `JWT_SECRET`** (`utils/jwt.ts`). Payload `{ sub, role, jti, shopId? }`.
  Expiries are centralised: `merchant: 7d`, `customer: 30d`, `admin: 8h`. `customer` is
  **already a declared role** in the `Role` union.
- **`jti` → `sessions` row** for targeted revocation. `sessions` (`schema.prisma:65`) has
  nullable `user_id` and `admin_id` and a `revoked_at`.
- **Guards** (`middleware/auth.ts`) all read `req.cookies.<name> ?? Authorization: Bearer …`,
  check `payload.role`, then look up the session and reject if missing or revoked. Cookie names:
  `token` (merchant), `adminToken` (admin), `customerToken` (customer).
- **Cookies** (`utils/cookies.ts`): `httpOnly`, `secure` + `SameSite=None` in production because
  the API (Render) and frontend (Vercel) are cross-site; `Lax` and insecure on localhost.
  `clearCookieOptions()` mirrors the attributes so logout actually deletes.
  Frontend sends `credentials: 'include'` (`frontend/lib/api-client.ts:9`).
- **The `X-Client: mobile` handshake** (`auth.ts:154-168`, `admin.ts:91`): React Native has no
  cookie jar, so a native client sends `X-Client: mobile` at login and the API returns the JWT
  **in the response body** instead of setting a cookie. The mobile client stores it in
  `expo-secure-store` (`mobile/src/lib/secure-store.ts` — OS keystore, never AsyncStorage, never
  an `EXPO_PUBLIC_*` var) and attaches `Authorization: Bearer …`. Crucially the *same* `Session`
  row and `jti` back the token either way, so revocation works identically.
- **Passwords**: `bcrypt` cost 12 (`auth.ts:49,234`).
- **Brute-force lockout**: Upstash Redis, `bf:count:<email>` / `bf:lock:<email>`, 5 failures →
  30-minute lock (`auth.ts:96-113`).
- **Enumeration resistance**: `forgot-password` always returns 200 (`auth.ts:202`).
- **Rate limiting** (`middleware/rate-limiter.ts`): a small Redis `INCR`+`EXPIRE` helper keyed by
  `req.userId ?? req.ip`. **It no-ops entirely when Redis is unconfigured** (`return next()`) —
  which matters a lot for OTP (§5.3).

### 4.2 What customer auth inherits, unchanged

| Concern | Decision |
|---|---|
| Token | Same `signToken`, `role: 'customer'`, 30d — already in `EXPIRY` |
| Web transport | `customerToken` httpOnly cookie via `authCookieOptions` — as today |
| Mobile transport | **Same `X-Client: mobile` handshake**; JWT in body → a **new** `bazarhq.customer.jwt` key in `expo-secure-store`, separate from merchant/admin keys and cleared independently (mirrors the existing rationale in `secure-store.ts`) |
| Revocation | **New**: write a `Session` row with `customer_id` and make `requireCustomer` check it, exactly like the other two guards. Closes the irrevocable-token gap in §1.2. |
| Password | bcrypt cost 12, same as merchants |
| Lockout | Same Redis `bf:*` pattern, namespaced `bf:cust:*` so a customer and a merchant sharing an email can't lock each other out |

**No third pattern is introduced.** The genuinely new mechanisms are the OTP challenge (§5),
scoped to signup-time email verification, and Google ID-token verification (§6), scoped to web.

### 4.3 Password vs. passwordless — recommendation

**Recommend: email + password, with a signup-time OTP proving the email is real** — plus Google
Sign-In on web (§6) as a second, pre-verified entry path.

Rationale, in priority order:

1. **Availability.** Passwordless-every-login makes *every single login* hard-dependent on email
   delivery. With Gmail SMTP that now also means every login depends on a ~500/day quota and an
   account Google could rate-limit. Betting the login path on that is the wrong risk.
2. **It reuses what's built.** bcrypt-12, the `bf:*` lockout, and the forgot-password/reset token
   machinery already exist and are proven in the merchant flow.
3. **It matches the stated constraint.** The OTP verifies email *ownership at signup* and must not
   become a login factor. Password-primary keeps that boundary clean by construction.

Passwordless (OTP on every login) remains a reasonable later addition and needs no schema change.

---

## 5. OTP design

### 5.1 Parameters

| Parameter | Value | Why |
|---|---|---|
| Format | **6-digit numeric**, `crypto.randomInt(0, 1_000_000)` zero-padded | CSPRNG, not `Math.random()`. Numeric = mobile numeric keypad, no case/charset confusion. |
| Expiry | **10 minutes** | Slower regional delivery + spam-folder retrieval. |
| Storage | **HMAC-SHA256(code, server pepper)**, never plaintext | See §5.2 |
| Comparison | **`crypto.timingSafeEqual`** on the digests | Constant-time; avoids timing oracles. |
| Single use | `consumed_at` set in the **same transaction** as `email_verified = true` | See §5.2 |
| Verify attempts | **5 per challenge**, then the challenge is locked (not just failed) | |
| Send rate, per email | **3 per 15 min** | Also caps Gmail quota burn (§2.4) |
| Send rate, per IP | **10 per 10 min** | |
| Account lockout | **10 cumulative failures in 24 h** → 24 h lock on that email | |
| Resend cooldown | **60 s** between sends, enforced server-side too | |
| Concurrency | Issuing a new challenge **invalidates all prior open challenges** for that email+purpose | Prevents a pool of simultaneously-valid codes. |

**Why HMAC with a pepper, not bcrypt.** A 6-digit code has 10⁶ possibilities. If the digests leak,
that space is exhaustible offline — bcrypt at cost 12 only slows it to hours per code, and plain
SHA-256 falls in seconds. **HMAC-SHA256 keyed with a server-side pepper** (`OTP_PEPPER`, a new
Render env var, distinct from `JWT_SECRET`) means a database-only compromise yields nothing
usable: without the key held in the application environment, an attacker cannot compute candidate
digests at all. Store `code_hash` as the hex digest.

### 5.2 Single-use, atomically

Verification runs in one `prisma.$transaction`:

1. Re-read the challenge `FOR UPDATE` (or rely on a conditional update).
2. Reject if `consumed_at IS NOT NULL`, `locked_at IS NOT NULL`, or `expires_at < now()`.
3. `timingSafeEqual` the digests. On mismatch: `attempt_count += 1`, set `locked_at` if it hits 5,
   bump the 24 h counter, **commit**, return `OTP_INCORRECT`.
4. On match: set `consumed_at`, set `customers.email_verified = true`, `status = active`, create
   the `Session` row — all in the same transaction. A retry of the same code then finds
   `consumed_at` set and fails.

Also **invalidate every other open challenge** for that email+purpose in the same transaction.

### 5.3 Rate limiting — and the Redis caveat

The existing `rateLimiter` (`middleware/rate-limiter.ts:14`) **silently disables itself when
Redis is unconfigured**. For `publicRateLimit` that is an acceptable degradation. For OTP it is
not: unlimited sends are now also a **Gmail-quota and account-suspension** risk (§2.4), and
unlimited verifies defeat the 5-attempt rule.

**Design:** OTP limits are enforced in **two layers**.

- **Layer 1 — Redis** (fast path), keys `otp:send:email:<sha256(email)>`, `otp:send:ip:<ip>`,
  `otp:fail:<sha256(email)>` (24 h), plus the **global daily counter** `email:sent:<YYYY-MM-DD>`
  from §2.4. Same `INCR`/`EXPIRE` idiom as the existing helper.
- **Layer 2 — Postgres** (authoritative, always on): the per-challenge `attempt_count` and a
  `COUNT(*)` of challenges issued for that email in the window, read from
  `customer_otp_challenges`. This layer cannot be disabled by a missing env var.

Hash the email in Redis keys so raw addresses aren't sitting in a third-party cache.

**Enumeration:** signup for an email that already has a *verified* account must **not** say so.
Return the same "we sent a code" response and instead email that address a "someone tried to sign
up with your address — sign in instead" notice. Same reasoning as `auth.ts:202`.

### 5.4 UX requirements (web and mobile)

- **Distinct error messages** — the user must be able to tell these apart:

  | Situation | Code | Message |
  |---|---|---|
  | Wrong digits | `OTP_INCORRECT` | "That code isn't right. *N* attempts left." |
  | Past 10 min | `OTP_EXPIRED` | "This code has expired. Request a new one." |
  | 5 failures on one code | `OTP_LOCKED` | "Too many incorrect attempts. Request a new code." |
  | Send limit hit | `OTP_SEND_RATE_LIMITED` | "You've requested several codes. Try again in *M* minutes." |
  | 24 h cumulative lockout | `OTP_ACCOUNT_LOCKED` | "Verification is locked for 24 hours. Contact support." |
  | Transport down / quota gone | `EMAIL_UNAVAILABLE` | "Email verification is temporarily unavailable." |

  All follow the existing `{ success: false, error: { code, message } }` envelope.
- **Visible expiry countdown** — `mm:ss` ticking to zero, driven by an `expiresAt` returned by
  the send endpoint (absolute ISO timestamp, so client clock skew shows as a small offset rather
  than a wrong duration).
- **Resend action** — disabled with a live "Resend in 0:47" label until the 60 s cooldown
  elapses, then a clear button. Server re-checks the cooldown regardless.
- 6 single-character inputs with paste-the-whole-code support; `inputMode="numeric"`,
  `autoComplete="one-time-code"` (iOS/Android autofill from the mail). Auto-submit on the 6th digit.
- **"Check your spam folder"** hint after the first resend. Gmail-to-Gmail should inbox reliably
  (§2.3), but non-Google receivers vary.
- Mobile: identical states in React Native; `autoComplete="sms-otp"` does **not** apply (this is
  email), so rely on the OS clipboard suggestion.

### 5.5 Scope boundary — read this before reusing OTP later

> **This OTP proves EMAIL OWNERSHIP at signup. It is NOT a second authentication factor.**
>
> Email is not an acceptable out-of-band channel for MFA: the email account is very often
> reachable with the same password, on the same device, and through the same recovery path as the
> account being protected — so a code sent there adds no independent factor. Do not later
> repurpose this mechanism as "2FA for customer login". If customer MFA is ever wanted, it needs
> TOTP (the pattern `admin_accounts.two_fa_secret` already establishes) or SMS via SSL Wireless —
> not this.
>
> Reusing OTP for *step-up on a sensitive action* (changing the account email) is legitimate and
> is why `purpose` is an enum in §7.2. That is re-proving ownership of a channel, not a factor.

---

## 6. Google Sign-In — web only, later sprint

> **Decision recorded:** Google Sign-In ships as a **later sprint, on web only**. Mobile customers
> register with email + OTP.

### 6.1 How it works (web)

1. Google Identity Services renders the "Sign in with Google" button on the web signup/login page.
2. The user picks an account; Google returns an **ID token** (a JWT) to the browser.
3. The browser POSTs it to `POST /v1/customer/auth/google` `{ idToken }`.
4. **The backend verifies the token** with `google-auth-library`
   (`OAuth2Client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })`), which checks:
   - **signature** against Google's published JWKS,
   - **`aud`** equals our client ID (the token was minted for *us*, not another site),
   - **`iss`** is `accounts.google.com` or `https://accounts.google.com`,
   - **`exp`** is in the future.
5. The backend additionally requires **`email_verified === true`** in the payload before trusting
   the email at all.
6. On success it reads `sub` (Google's stable account ID), `email`, `name`, `picture`, resolves
   the account per §6.3, and issues the normal customer JWT + `Session` row + `customerToken`
   cookie. **Identical session machinery to password login** — no new realm.

**Cost: free.** **No client secret is needed** — this is ID-token verification, not an
authorization-code exchange, so the only config is `GOOGLE_CLIENT_ID` (server) and
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` (browser). `google-auth-library` is **not currently installed**.

Note: `CLAUDE.md` lists "Supabase Auth (Google OAuth)" in the stack table, but the codebase
implements custom JWT auth throughout and does not use Supabase Auth. This design stays
consistent with the code, not the table — we verify the ID token ourselves.

### 6.2 Why mobile is excluded for now — rationale recorded

Google Sign-In on React Native requires a **native module**
(`@react-native-google-signin/google-signin`), and that has concrete costs the email+OTP path does
not:

- **It does not work in Expo Go.** Adopting it forces a **development build**, which changes the
  day-to-day dev workflow away from the current Expo Go loop.
- **Two SHA-1 fingerprints must be registered** in the Google Cloud console — the debug keystore's
  *and* the release keystore's. **The release SHA-1 lives with EAS**, since EAS holds the signing
  keystore, so it has to be pulled from there.
- **It is a native change**, so it needs a full **APK rebuild** and cannot ship as an OTA update.

That is a meaningful workflow cost for a convenience feature. **Mobile customers register with
email + OTP**, which works in Expo Go today and needs no native module. Revisit if/when a
development build is warranted for other reasons.

### 6.3 Account linking — the rule, and why

**The scenario:** someone registers with email + password as `x@gmail.com`. Later they click
"Sign in with Google" with that same address. Link, reject, or duplicate?

**Proposal: LINK automatically — with one guard.**

> **Rule.** Resolve in this order:
> 1. **`google_sub` matches an existing customer** → sign that customer in. (`sub` is the stable
>    identifier; email can change.)
> 2. **No `google_sub` match, but the lowercased email matches an existing customer** →
>    **link**: set `google_sub`, `google_linked_at`, `email_verified = true`, `status = active`.
>    - **Guard:** if that customer's `email_verified` was **`false`** (a `pending_verification`
>      row), also **null out `password_hash`** and invalidate every open OTP challenge for the
>      address. See below.
>    - Send a notification email to the address: "Google sign-in was linked to your BazarHQ
>      account."
> 3. **No match** → create a new customer with `google_sub`, `email_verified = true`,
>    `password_hash = NULL`, `status = active`, after the consent step (§8.1).

**Why link rather than duplicate.** Duplication is the worst outcome available: it violates
`customers.email @unique`, splits one person's order history across two accounts, makes
"forgot password" ambiguous, and contradicts the customer's own mental model of having one
account. There is no scenario in which two rows for one verified mailbox is the right answer.

**Why link rather than reject.** Rejecting ("an account already exists — sign in with your
password") is *safe*, but it strands the very common customer who has forgotten which method they
used, and it buys nothing: the person signing in with Google has just proven to Google that they
control that mailbox, and our account's `email_verified` flag means they proved control of the
*same* mailbox to us. **Both sides are proofs of control of one address.** Joining two proofs of
the same mailbox is recognition of one person, not a privilege escalation. Rejection stays as the
fallback for the collision case in §6.4, not as the default.

**The guard, and the attack it stops.** Anyone can create a `pending_verification` row for a
stranger's address simply by typing it at signup — no proof required, that is the whole point of
the OTP. Suppose an attacker registers `victim@gmail.com` with password `P` and never verifies.
The victim later signs in with Google. If we linked naively, the victim would end up owning an
account that **still carries the attacker's password** — and the attacker could then log in as
them with `P`. That is a full account takeover, arriving through the front door.

Nulling `password_hash` when linking into an unverified row closes it: the attacker's credential
is destroyed at the moment of linking, and the account has exactly one working credential — the
Google identity the real owner just proved. The customer is told "your email is verified via
Google; set a password from your account page if you'd like one." Setting a password later goes
through the normal reset flow, which mails the address they now demonstrably control.

Linking into an **already-verified** row is safe without that step: that password was set by
someone who completed an OTP to the same mailbox, so it is the same person.

### 6.4 Edge cases

| Case | Resolution |
|---|---|
| Google-created account (no password) later uses "forgot password" | Allowed. The reset mails the address, which they control. Afterwards both methods work. Standard. |
| Google account's email changes (Workspace) — `sub` matches, email differs | `sub` wins; update the stored email **if it is free**, and notify both the old and new address. If the new address is already taken by another customer, **reject** and route to support — a silent merge of two accounts is never acceptable. |
| A **merchant** `User` exists with the same email | No interaction. Different table, different relationship to the platform, different retention and consent (§7.1). One person can be both. |
| `email_verified: false` in the Google payload | **Reject the sign-in.** Without Google's own verification the email proves nothing, and the whole linking argument collapses. |
| Customer is `suspended` or `deactivated` | Google sign-in does **not** resurrect them. Same status checks as password login (`auth.ts:122` precedent). |

### 6.5 What it costs elsewhere

Almost nothing, if the columns land in the single schema sprint:

- **Schema:** `google_sub` (unique, nullable), `google_linked_at`, optional `avatar_url` — all in
  §7.1, all nullable. `password_hash` is **already nullable** in that design, which is exactly
  what a Google-only account needs.
- **OTP:** skipped entirely for Google users — that is the bonus. Google has already verified the
  address, so `email_verified` is true at creation and there is no code to send, no quota
  consumed, no spam-folder risk.
- **Consent:** **not** skipped. The consent step (§8.1) runs before account creation regardless of
  how the person authenticated. Google proves an email; it does not record consent.

---

## 7. Schema (additive only)

All new tables; two new nullable columns on existing tables (plus three on `customers` itself for
Google); one FK set and indexes on an existing all-`NULL` column. **Nothing is dropped, renamed,
or retyped.**

### 7.1 `Customer` — new

```prisma
model Customer {
  id            String         @id @default(uuid())
  email         String         @unique                              // stored lowercased
  passwordHash  String?        @map("password_hash")                // bcrypt 12; null for Google-only
  fullName      String?        @map("full_name")
  phone         String?                                             // ^01[3-9]\d{8}$; UNVERIFIED
  emailVerified Boolean        @default(false) @map("email_verified")
  status        CustomerStatus @default(pending_verification)
  lastLoginAt   DateTime?      @map("last_login_at")

  // Google Sign-In (§6) — web only. Columns land now so there is ONE schema sprint.
  googleSub      String?   @unique @map("google_sub")   // Google's stable account id
  googleLinkedAt DateTime? @map("google_linked_at")
  avatarUrl      String?   @map("avatar_url")

  createdAt     DateTime       @default(now()) @map("created_at")
  updatedAt     DateTime       @updatedAt @map("updated_at")

  // Consent withdrawal / erasure. Soft first so completed orders keep their FK
  // and their legal retention (§8.4). Never reuse the email of a live row.
  deletedAt     DateTime?      @map("deleted_at")

  orders    Order[]
  sessions  Session[]
  addresses SavedAddress[]

  @@index([status, createdAt])   // admin list
  @@index([deletedAt])           // erasure sweeps
  @@map("customers")
}

enum CustomerStatus {
  pending_verification   // signed up, OTP not yet completed
  active
  suspended              // admin action
  deactivated            // customer withdrew consent / closed account
}
```

**Why a separate table rather than reusing `User`:** `User` is structurally merchant-shaped — it
owns `shop Shop?`, `shops.user_id` is `UNIQUE`, `POST /v1/auth/register` unconditionally creates
a merchant, and `/v1/admin/merchants` lists `User` rows. Adding customers there would put
non-merchant rows into every merchant admin query and count, and would force a discriminator
column onto a table four working features already read. A separate table changes nothing existing.
A person who is both a merchant and a shopper gets two rows with the same email — correct, since
they are two different relationships to the platform with different retention and consent.

**Google columns are included in this sprint deliberately**, even though §6 ships much later:
they are nullable, cost nothing, and including them means the production database is touched
**once** for account data instead of twice.

### 7.2 `CustomerOtpChallenge` — new

```prisma
model CustomerOtpChallenge {
  id           String     @id @default(uuid())
  email        String                                      // lowercased; NOT a FK — a challenge
                                                           // can precede the customer row
  customerId   String?    @map("customer_id")              // set once the customer exists
  purpose      OtpPurpose @default(email_verification)
  codeHash     String     @map("code_hash")                // HMAC-SHA256(code, OTP_PEPPER), hex
  attemptCount Int        @default(0) @map("attempt_count")
  maxAttempts  Int        @default(5) @map("max_attempts")
  expiresAt    DateTime   @map("expires_at")
  consumedAt   DateTime?  @map("consumed_at")              // single-use marker
  lockedAt     DateTime?  @map("locked_at")                // attempts exhausted / superseded
  ipAddress    String?    @map("ip_address")
  userAgent    String?    @map("user_agent")
  emailMessageId String?  @map("email_message_id")         // SMTP message id, for support
  createdAt    DateTime   @default(now()) @map("created_at")

  @@index([email, purpose, createdAt])   // rate-limit window count (Layer 2, §5.3)
  @@index([expiresAt])                   // purge job
  @@index([customerId])
  @@map("customer_otp_challenges")
}

enum OtpPurpose {
  email_verification   // signup — the only one used in v1
  email_change         // step-up re-proof of a new address (§5.5)
}
```

Retention: purge rows **30 days** after `expires_at`. Long enough for abuse investigation, short
enough not to accumulate.

### 7.3 `ConsentRecord` — new, append-only

```prisma
model ConsentRecord {
  id            String             @id @default(uuid())
  subjectType   ConsentSubjectType @map("subject_type")   // customer | merchant
  subjectId     String             @map("subject_id")     // customers.id or users.id
  policyType    PolicyType         @map("policy_type")
  policyVersion String             @map("policy_version")  // e.g. "2026-08-01"
  action        ConsentAction                              // granted | withdrawn
  channel       String                                     // "web" | "mobile"
  ipAddress     String?            @map("ip_address")
  userAgent     String?            @map("user_agent")
  recordedAt    DateTime           @default(now()) @map("recorded_at")

  @@index([subjectType, subjectId, recordedAt])
  @@index([policyType, policyVersion])
  @@map("consent_records")
}

enum ConsentSubjectType { customer  merchant }
enum PolicyType         { privacy_policy  terms_of_service  marketing_email }
enum ConsentAction      { granted  withdrawn }
```

**Append-only, never updated.** Withdrawal is a new `withdrawn` row, not a mutation — the history
of who agreed to what, when, is the entire evidentiary value. Follow the `audit_logs` precedent
(`schema.prisma:461`) and enforce it with a **PostgreSQL trigger rejecting `UPDATE` and
`DELETE`**; the project already does exactly this for audit logs, so it is an established pattern.

Current consent state = the latest row per `(subject, policy_type)`.

**Policy text lives in git, not the database.** A `PolicyDocument` table would duplicate what
version control already does better. Store versioned Markdown at
`frontend/content/policies/privacy-policy.2026-08-01.md` (and terms likewise); the DB stores only
the version string. Git gives the immutable diff history, review and blame for free. The active
version is a single exported constant so web, mobile and API cannot disagree.

### 7.4 `Session` — one nullable column added

```prisma
model Session {
  // ... unchanged ...
  customerId String?   @map("customer_id")            // NEW, nullable
  customer   Customer? @relation(fields: [customerId], references: [id])
  @@index([customerId])                               // NEW
}
```

Nullable with no default → metadata-only `ADD COLUMN` in Postgres, no table rewrite. Every
existing merchant and admin session row stays `NULL` and every existing query
(`findUnique({ where: { jti } })`, the `updateMany` revocations) behaves identically. This is
what lets `requireCustomer` finally check revocation like its two siblings.

### 7.5 `Order` and `SavedAddress` — FK and one nullable column

```prisma
model Order {
  customerId String?   @map("customer_id")            // ALREADY EXISTS — only gains a relation
  customer   Customer? @relation(fields: [customerId], references: [id])
  @@index([customerId, createdAt])                    // NEW — customer's own history
  @@index([shopId, customerId])                       // NEW — merchant's view of one customer
}

model SavedAddress {
  customerAccountId String?   @map("customer_account_id")   // NEW — see §3.3
  customerAccount   Customer? @relation(fields: [customerAccountId], references: [id])
  @@index([customerAccountId])                              // NEW
}
```

`Order.customerId` needs **no `ALTER … TYPE`** — it is already `TEXT`/nullable and holds `NULL` in
every row. It gains a foreign key and two indexes, nothing else. `SavedAddress.customerId` (the
phone-keyed column) is **left completely alone**.

### 7.6 `email_sends` — recommended (upgraded from optional)

`id, to_email_hash, template, status, provider_message_id, error, created_at`. Store a hash of the
recipient, not the address.

This was optional under Resend, which offers delivery webhooks. **Gmail SMTP offers none** —
bounces arrive as human-readable messages in the inbox and nothing is machine-readable. This log
becomes the only programmatic record that a send was accepted, and the only way to answer "the
code never arrived". It also backs the **daily quota counter** (§2.4). Include it.

### 7.7 The SQL artifact

Per `CLAUDE.md`, the file applied in Supabase is **generated, not hand-written**:

```bash
git show HEAD:api/prisma/schema.prisma > /tmp/old.prisma
npx prisma migrate diff --from-schema-datamodel /tmp/old.prisma \
  --to-schema-datamodel prisma/schema.prisma --script
```

saved to `api/prisma/sql/<sprint>_customer_accounts.sql`, with a header in the style of
`c0_taxonomy.sql`, applied by a human in the Supabase SQL editor, **then** the API deployed
(apply-then-deploy: new tables are invisible to running code, so there is no window where the app
expects something the DB lacks). Producing that file is a build task, not a design task.

**Expected delta shape** (for review when generated):

- `CREATE TYPE` × 5 — `CustomerStatus`, `OtpPurpose`, `ConsentSubjectType`, `PolicyType`,
  `ConsentAction`
- `CREATE TABLE` × 4 — `customers`, `customer_otp_challenges`, `consent_records`, `email_sends`
  (all new, all empty)
- `ALTER TABLE sessions ADD COLUMN customer_id TEXT` — nullable, no default
- `ALTER TABLE saved_addresses ADD COLUMN customer_account_id TEXT` — nullable, no default
- `ADD FOREIGN KEY` × 4 — sessions→customers, orders→customers, saved_addresses→customers,
  otp_challenges→customers
- `CREATE INDEX` × ~10, including the unique index behind `customers.google_sub`
- Plus one hand-added statement `migrate diff` will not generate: the **append-only trigger** on
  `consent_records`, copied from the `audit_logs` trigger.

**Lock profile:** every `ADD COLUMN` is nullable-with-no-default (metadata-only, no rewrite);
every FK targets a column that is entirely `NULL` (instant validation); every index is on a new
or empty column. At current row counts all of it is sub-second.

---

## 8. Consent & privacy

> **⚠️ This is a design based on published summaries of Bangladesh's Personal Data Protection
> Ordinance 2025 / Act 2026. It is NOT legal advice.** I have not read the enacted statutory text
> or any implementing rules, and the regime is new enough that authoritative guidance and
> enforcement practice are still forming. **Before this ships to real customers, have a
> Bangladeshi data-protection practitioner review it** — the consent wording, the retention
> periods, the lawful basis for each processing purpose, and above all the residency question in
> §8.6. Treat every specific period and category below as a **placeholder pending that review**.

### 8.1 Consent step — before account creation, both roles

A **blocking, unticked** consent step immediately before the account is created — for customers at
signup, and (new) for merchants at `POST /v1/auth/register` too. **This applies to Google Sign-In
as well** (§6.5): Google proves an email, it does not record consent.

Requirements:
- **Not pre-ticked.** Unticked by default; the submit button stays disabled until ticked.
- **Not bundled.** Privacy policy and terms are **separate checkboxes**. Marketing email is a
  **third, genuinely optional** checkbox that never blocks account creation.
- **Legible in place.** The full disclosure (§8.2) is visible on the page — a scrollable panel or
  an expander — not only behind a link. Links to the full policy sit beside it.
- **Recorded, not just displayed** — §8.3.
- Same requirement on **web and mobile**, same policy version, same wording.

For merchants this adds a blocking control to a currently-working signup form — flagged in §12.

### 8.2 What the disclosure must state

**(a) Purpose of collection** — specific, per category:

| Data | Purpose |
|---|---|
| Email address | Account identity, login, verifying you own the address, order receipts and status updates |
| Password (hashed) | Authenticating you |
| Google account ID (if you sign in with Google) | Recognising your account on return visits |
| Name, phone, delivery address | Fulfilling and delivering orders you place; shared with the merchant you order from |
| Order history | Showing your orders; the merchant's record of their own sales; accounting |
| Consent records | Proving what you agreed to and when |
| IP address, user agent | Fraud and abuse prevention, rate limiting, security investigation |
| Marketing email (if opted in) | Offers and updates — only if you ticked it, withdrawable any time |

**(b) Retention period** — concrete durations, not "as long as necessary":

| Data | Retained | Why |
|---|---|---|
| Account (email, name, credentials) | While the account is open; **90 days** after closure, then erased | Reversal window for accidental closure |
| Completed orders + delivery snapshot | **7 years** from order date | Business/accounting records; survives account deletion — §8.4 |
| OTP challenge records | **30 days** after expiry | Abuse investigation |
| Email send log | **90 days** | Support ("I never got the code") |
| Consent records | **7 years** | The evidence itself; deleting it defeats the purpose |
| Session records | Until expiry + **90 days** | Security investigation |
| Page views (analytics) | **24 months**, already pseudonymised (`page_views.visitor_hash`) | |

*(Placeholders pending the review in the box above — the 7-year figure in particular should be
checked against Bangladeshi tax/accounting record-keeping requirements.)*

**(c) Who the data is transferred to** — name them, and say where:

| Recipient | What they receive | Where | Why |
|---|---|---|---|
| **The merchant you order from** | Your name, phone, delivery address, email, and your order history **with that shop only** | Bangladesh | They fulfil and deliver your order |
| **Supabase** (PostgreSQL) | All stored account and order data | **Singapore** ⚠️ | Database hosting — §8.6 |
| **Render** | Data in transit through the API; request logs | Region per the service config | API hosting |
| **Vercel** | Page requests and delivery of the web app | Global edge | Frontend hosting |
| **Cloudinary** | Product images (merchant-uploaded, not customer data) | Global CDN | Image hosting/CDN |
| **Google** (Gmail SMTP, and Sign-In if used) | Your email address and message content; for Sign-In, the authentication itself | Global | Sending verification and order emails; optional sign-in |
| **Upstash** (Redis) | Hashed identifiers for rate limiting and lockout | Per configured region | Abuse prevention |
| **SSL Wireless** | Your phone number and message text | Bangladesh | Order SMS, if enabled |

> **Note the change from the previous revision:** the email recipient is now **Google**, not
> Resend. Since Google is also the Sign-In provider (§6) and the analytics-free mail path, it is
> listed once covering both roles. Resend receives nothing while `EMAIL_PROVIDER=smtp`; if that
> ever flips, this row must be updated **and a new policy version published**.

The precise deployment region of Render, Vercel and Upstash should be confirmed from each
dashboard and pinned before publishing — do not publish a guess.

**(d) How to withdraw consent** — a real mechanism, not an email address alone: an in-app
**Account → Privacy** screen with "Withdraw consent and close my account" and a separate
marketing-email toggle, plus a named contact for requests. Say what withdrawal does and doesn't
do (§8.4) *on that screen*, before confirming.

### 8.3 Recording consent

On submit, one `ConsentRecord` row **per policy accepted** — capturing `subjectType`, `subjectId`,
`policyType`, `policyVersion`, `action: granted`, `channel`, `ipAddress`, `userAgent`,
`recordedAt`. Written in the **same transaction** as the account creation, so an account can never
exist without its consent record.

**Version bumps.** When a policy's version changes, existing users are shown a re-consent prompt
at next login. `GET /v1/customer/me` returns `consentCurrent: boolean` plus the version they last
accepted; the client renders the prompt. Do not silently treat old consent as covering new terms.

### 8.4 Withdrawal — what it does, and what it cannot undo

Withdrawal is a **new `withdrawn` row**, never a deletion of the `granted` row.

**Withdrawing `marketing_email`** (independent, no account impact): a `withdrawn` row; marketing
sends stop immediately. Transactional mail (order receipts, status) is **not** marketing and
continues while orders are live — say so plainly on the screen.

**Withdrawing `privacy_policy` consent** = closing the account, because the platform cannot
operate an account without processing its data. On confirmation:

1. `ConsentRecord(action: withdrawn)` for each policy.
2. `customers.status = deactivated`, `deleted_at = now()`.
3. All sessions revoked (`sessions.revoked_at`) — logged out everywhere, both platforms.
4. Saved addresses **hard-deleted** (no legal basis to keep them).
5. Email replaced with a non-reversible tombstone (`deleted+<uuid>@invalid`) after the 90-day
   window, so the address is releasable and the row cannot be re-identified.
6. Password hash cleared; **`google_sub` cleared** so a later Google sign-in creates a fresh
   account rather than resurrecting the closed one.

**What it cannot undo — stated to the user before they confirm:**

- **Completed orders are retained** (order number, items, amounts, and the name/phone/address
  snapshot on the order) for the accounting/legal retention period in §8.2(b). This is a
  legitimate retention basis independent of consent; it is not a loophole, and it must be
  disclosed *before* the confirm button.
- **The merchant's own copy** of orders they fulfilled is theirs as a business record and is not
  erased by a platform-side withdrawal.
- **Consent records themselves are retained** — they are the proof consent was given and withdrawn.
- **Audit logs** (`audit_logs`, INSERT-only by trigger) are retained.

**In scope but distinct: data export.** A "download my data" action (JSON of profile, addresses,
consent history, order list) is cheap once the model exists and is a near-universal expectation of
this class of law. Included in Sprint 8.

### 8.5 Where the policy pages live

| Surface | Location |
|---|---|
| Web — canonical | `frontend/app/privacy/page.tsx`, `frontend/app/terms/page.tsx` |
| Web — source text | `frontend/content/policies/{privacy-policy,terms-of-service}.<version>.md` |
| Web — links | Footer of the landing page, storefront footer (`StorefrontShell`), checkout consent step, merchant signup, account privacy screen |
| Mobile | `mobile/src/app/(customer)/legal/privacy.tsx` and `terms.tsx`, rendering the **same** Markdown bundled with the app, plus a link out to the web version so a live update is always reachable |
| API | `GET /v1/policies/current` → `{ privacyPolicy: { version, url }, termsOfService: { … } }` so mobile can detect a version bump without an app release |

> **⚠️ Middleware landmine — this will silently break if not handled.**
> `frontend/middleware.ts:30` rewrites *any* path not in `FIRST_PARTY_PREFIXES` to
> `/sites/{shop}{path}` whenever a `_dev_shop` cookie or `?_shop=` param is present. A new
> top-level `/privacy` route will be rewritten to `/sites/{shop}/privacy` — **a 404** — for any
> visitor who has browsed a storefront in that session. This is the exact trap
> `docs/marketplace-plan.md` flagged for `/marketplace`. **`'/privacy'` and `'/terms'` must be
> added to `FIRST_PARTY_PREFIXES`.**
>
> Decide deliberately whether storefronts get their *own* `/sites/[shop]/privacy` (the shop's
> policy) in addition to the platform's. **Recommendation for v1: no.** BazarHQ is the data
> controller for accounts; one platform policy, linked from every storefront footer, is simpler
> and more accurate. Per-shop policies are a later feature.

### 8.6 ⚠️ Data residency — the open legal question

Published summaries of the Bangladeshi regime indicate a **data-localisation obligation for
certain classes of personal data** — categories described as *sensitive*, *classified*, or
*restricted* may be required to be stored **within Bangladesh**. The exact category definitions
and the scope of any mirroring-versus-exclusive-storage requirement are precisely the details I
cannot confirm from summaries.

**Our database is Supabase, hosted in Singapore.** If customer identity data falls inside a
localised category, the current architecture does not comply, and the remedy is
infrastructural — a Bangladeshi-region database or a local mirror — not a wording change. That is
an expensive finding if it arrives late.

**Therefore: get this specific question answered before Sprint 2 (the first schema sprint), not
after the feature is built.** It is the one item in this plan that could invalidate the
architecture rather than merely amend the copy. It is also worth confirming whether the
obligations attach at a registration threshold or apply from first collection.

---

## 9. Who sees what — data minimisation by role

### 9.1 Merchant

**Sees, for their own shop only:**
- On each of their orders: customer **name, phone, delivery address, email** — exactly what
  `orders` already exposes today, unchanged.
- **That customer's order history with that shop**: order count, first/last order date, lifetime
  spend at that shop, and the list of those orders.
- Whether the customer has a **verified account** (a badge) versus checked out as a guest.

**Must not see:**
- Any order at any **other** shop, or any cross-shop aggregate. A merchant must not be able to
  learn that a customer shops elsewhere, let alone where or how much.
- Browsing behaviour. `page_views` is already pseudonymised to `visitor_hash` and is **never**
  joined to a customer identity — that join must not be built.
- Payment credentials — none are stored for COD/bKash/Nagad beyond a customer-supplied
  transaction ID, and SSLCommerz is a redirect flow where card data never touches our servers.
  Merchant payment credentials remain AES-256-GCM encrypted and masked (`payment_configs`).
- Password hashes, Google account IDs, sessions, OTP records, consent records.
- Email addresses of customers who have **never ordered from them** — the merchant customer list
  is derived strictly from their own orders, never from `customers`.

**Justification.** The merchant is the delivery party; name, phone and address are operationally
necessary and they already have them. Per-shop history is a legitimate business need (repeat
customers, disputes) and is *derivable from data they already hold* — so it discloses nothing new.
Cross-shop visibility, by contrast, would disclose a customer's relationship with a merchant's
**competitors**, which serves no fulfilment purpose and is exactly what a shopper would not
expect. That line is where minimisation bites.

**Enforcement — same shop-scoping used everywhere else.** Every merchant handler already begins
`prisma.shop.findUnique({ where: { userId: req.userId } })` then filters `shopId: shop.id`
(`orders.ts:267,274,302,320`). The new customer endpoints follow it identically:

```
GET /v1/orders/customers                 → distinct customers over THIS shop's orders
GET /v1/orders/customers/:customerId      → aggregates + orders, WHERE shopId = shop.id
                                             AND customerId = :customerId
```

The `@@index([shopId, customerId])` from §7.5 exists precisely to make the shop-scoped query the
natural, fast one. **No merchant endpoint ever queries `customers` unscoped**, and none returns a
field the shop's own orders don't already contain. Application-level filtering plus the existing
RLS layer, as everywhere else in this codebase.

### 9.2 Admin (superadmin)

**Sees by default** — the platform-operations minimum:
- Account existence, **email**, registration date, `emailVerified`, `status`, last login, and
  whether the account uses Google sign-in.
- **Aggregate counts only**: total orders, total spend, number of distinct shops ordered from
  (the *count*, not the identities), date of last order.
- Consent status: which policy versions accepted, when, and any withdrawal.

**Does not see by default:** order contents, delivery addresses, phone numbers, per-order detail,
saved addresses, browsing history.

**Justification.** An admin's actual jobs are support ("does this account exist / is it
verified"), abuse handling (suspend), and platform metrics (how many customers, how active). All
three are served by identity plus aggregates. Reading what a specific person bought and where they
live is not required by any of them — and the platform admin is the role with the broadest reach
and the least natural accountability, so it should have the *narrowest* default.

**Should deeper access exist at all? Yes — narrowly, and audit-logged.**

A refusal to build it just relocates the access to direct Supabase SQL, which is *worse*: no audit
trail, no scoping, no rate limit. Better to make the legitimate path the observable one.

Design: `GET /v1/admin/customers/:id/orders/:orderId?reason=<text>`
- **Reason string required** (min ~10 chars) — captured, not optional.
- **Writes an `audit_logs` row** on every single read: `action: 'ADMIN_VIEWED_CUSTOMER_ORDER'`,
  `targetType: 'Customer'`, `targetId`, `metadata: { orderId, reason }`, `ipAddress`. The
  `writeAuditLog` helper and the INSERT-only trigger already exist.
- **Restricted to `AdminRole.superadmin`**, not `support`.
- Rate-limited, and surfaced in the existing `/superadmin/audit-logs` UI so the reads are
  reviewable rather than merely recorded.
- Editing customer data is **not** offered at all — read-only, plus suspend/reactivate.

Suspension already has the right precedent: `PATCH /v1/admin/merchants/:id` writes an audit log and
revokes sessions (`admin.ts:359-375`). Customer suspension mirrors it exactly.

### 9.3 Customer

Own profile, own addresses, own order history across all shops (their own data), own consent
history, own data export. **A customer never sees another customer**, and never sees merchant
internals.

---

## 10. API surface (additive — all new paths)

Every route below is **new**. No existing endpoint changes its request or response shape.
`POST /v1/orders/guest` is **untouched for the entire phase**.

**Customer auth** — `/v1/customer/**`
| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/signup` | email, password, name, consent flags → creates `pending_verification` customer + consent rows + OTP challenge, sends code |
| `POST` | `/auth/verify-otp` | email + 6-digit code → verifies, activates, creates session, logs in |
| `POST` | `/auth/resend-otp` | 60 s cooldown + rate limits |
| `POST` | `/auth/login` | **new handler**, email + password; honours `X-Client: mobile` |
| `POST` | `/auth/google` | **Sprint 10, web only.** `{ idToken }` → verify → link/create per §6.3 |
| `POST` | `/auth/logout` | now revokes the `Session` row, not just the cookie |
| `POST` | `/auth/forgot-password`, `/auth/reset-password` | mirrors `auth.ts:199-247`, always-200 |
| `GET` | `/me` | profile + `consentCurrent` + `hasPassword` + `hasGoogle` |
| `PATCH` | `/me` | name, phone |

> `POST /v1/customer/auth/login` **changes contract** — from `{ phone }` to `{ email, password }`.
> This is the one deliberate breaking change (Finding A). Sequenced in Sprint 6; see §12.

**Consent & privacy** — `/v1/customer/**`, `/v1/policies/**`
| Method | Path |
|---|---|
| `GET` | `/v1/policies/current` (public) |
| `GET` | `/v1/customer/consents` |
| `POST` | `/v1/customer/consents` (re-consent after a version bump; marketing toggle) |
| `POST` | `/v1/customer/consents/withdraw` |
| `GET` | `/v1/customer/data-export` |

**Checkout** — `/v1/orders/**`
| Method | Path | Notes |
|---|---|---|
| `POST` | `/v1/orders` | **new**, `requireCustomer`. Same body as `/guest` minus the identity fields (taken from the account), sets `customer_id`, still writes the full snapshot |
| `POST` | `/v1/orders/guest` | **unchanged, still mounted, still works** |

**Merchant** — `/v1/orders/**`, shop-scoped
| Method | Path |
|---|---|
| `GET` | `/v1/orders/customers` |
| `GET` | `/v1/orders/customers/:customerId` |

**Admin** — `/v1/admin/**`
| Method | Path | Notes |
|---|---|---|
| `GET` | `/v1/admin/customers` | list + search, minimal fields |
| `GET` | `/v1/admin/customers/:id` | + aggregates |
| `PATCH` | `/v1/admin/customers/:id` | suspend/activate, audit-logged |
| `GET` | `/v1/admin/customers/:id/orders/:orderId` | superadmin only, reason required, audit-logged |

---

## 11. Staging — sprint plan

Small, independently testable, live system working after each. **Email first**, because everything
depends on it and it is the item most likely to surface a surprise.

| # | Sprint | Touches prod DB? | Touches working features? |
|---|---|---|---|
| 0 | **Gmail SMTP transport — wire and prove end to end** | **YES** (small: `email_sends`) | ⚠️ **transactional email goes live** |
| 1 | Policy pages + versioning | No | ⚠️ middleware allowlist |
| 2 | Schema (incl. Google columns) | **YES** | No (nothing reads the new tables) |
| 3 | Customer auth API (signup / OTP / login) | No | No (new endpoints only) |
| 4 | Web account UX | No | No |
| 5 | Checkout linkage | **YES** (FK + indexes) | ⚠️ **checkout** |
| 6 | Retire phone-only login | No | ⚠️ **breaking, deliberate** |
| 7 | Merchant customer view | No | No |
| 8 | Admin view + consent lifecycle | No | ⚠️ merchant signup consent |
| 9 | Mobile — customer auth **+ build checkout** | No | No (mobile checkout doesn't exist yet) |
| 10 | **Google Sign-In (web only)** | No (columns landed in S2) | No |

---

**Sprint 0 — Gmail SMTP transport. Prove it end to end.**
Enable 2-Step Verification, generate the app password. Install `nodemailer`. Build the swappable
transport layer (§2.5) with `gmail-smtp` active and the Resend code moved across dormant. Add
`sendOtpEmail()` with throwing semantics (§2.6) and the daily-quota counter. Set the seven env vars
in the **Render dashboard** — they are `sync: false` and will not arrive via a push. Add
`email_sends` (§7.6) — the only DB touch, one new empty table.
**Done when:** every item in §2.7 passes, from production Render.
*This sprint can fail in ways that reshape everything after it — port 465 blocked, mail landing in
spam, quota behaving unexpectedly. That is exactly why it is first.*

**Sprint 1 — Policy pages + versioning. No DB.**
Write the privacy policy and terms text (§8.2) as versioned Markdown — **including Google as the
email and sign-in recipient** (§8.2c). Web `/privacy` + `/terms`; **add both to
`FIRST_PARTY_PREFIXES`** (§8.5); footer links. Mobile legal screens. `GET /v1/policies/current`.
**Kick off the legal review here — especially §8.6 residency — so the answer arrives before
Sprint 2.**
**Done when:** both pages render on the deployed frontend, and load correctly *while a `_dev_shop`
cookie is set* (the middleware regression test).

**Sprint 2 — Schema. ⚠️ TOUCHES PRODUCTION DB.**
Prisma models from §7, **including the Google columns** so this is the only account-schema touch.
Generate the SQL via `migrate diff`, review, apply in Supabase, then deploy. Hand-add the
`consent_records` append-only trigger.
**Done when:** all tables exist, are empty, `SELECT` cleanly, and **the entire existing app is
verifiably unchanged** — merchant login, storefront browse, guest checkout, superadmin, mobile.

**Sprint 3 — Customer auth API. No DB change.**
Signup → OTP → verify → login → me. Session rows for customers; `requireCustomer` starts checking
revocation. Both rate-limit layers (§5.3). Consent recorded transactionally with signup.
**Done when:** the full cycle passes against production via curl/Postman, including every error
case in §5.4, and the 5-attempt lock and 3-per-15-min send limit both actually trip.

**Sprint 4 — Web account UX. No DB change.**
Signup, OTP entry (countdown + resend), login, forgot/reset, account page migrated to the new
`/me`. Consent step with separate checkboxes.
**Done when:** a real person creates an account on the deployed frontend, receives the code by
email, verifies, logs out, logs back in. Guest checkout still works — check it explicitly.

**Sprint 5 — Checkout linkage. ⚠️ TOUCHES PRODUCTION DB *and* CHECKOUT. Highest risk.**
FK + indexes on `orders.customer_id` (apply-then-deploy). New `POST /v1/orders`. Checkout page
gains a branch: signed in → prefilled, one-click; not signed in → **"Sign in or create an account"
(primary) and "Continue as guest" (secondary, always present, always working)**.
**Done when:** an account order lands with `customer_id` set and appears in that customer's
history; **and a guest order still completes end to end with `customer_id` NULL** — that second
check is the sprint's real acceptance test. Keep the guest path first in the test script, not last.

**Sprint 6 — Retire phone-only login. ⚠️ DELIBERATE BREAKING CHANGE.**
Replace the `POST /v1/customer/auth/login` handler; the old phone-based path stops working. Any
existing phone-token holder is signed out. The old storefront login page becomes "sign in or create
an account", with the existing `/track` (order number + phone) still available for one-off order
lookup — so nobody loses the ability to check an order.
**Sequenced here on purpose:** after accounts exist, so there is somewhere to send people; and not
later, because the hole in §1.3 should not outlive the phase. If it needs to move earlier,
disabling the endpoint outright (returning "please use the new sign-in") is a valid one-line
interim.

**Sprint 7 — Merchant customer view. No DB change.**
Shop-scoped customers list + detail; a "Customer" panel on order detail. Web dashboard, and the
mobile merchant tab (self-contained inside the `(merchant)` stack — no cross-tab navigation).
**Done when:** merchant A provably cannot see merchant B's orders for the same customer. Test that
explicitly with two shops and one shared customer — it is the whole point of the sprint.

**Sprint 8 — Admin view + consent lifecycle. No DB change.**
Admin customers list/detail, suspend/activate, the audit-logged deep-read (§9.2). Consent
withdrawal, marketing toggle, data export, re-consent on version bump. **Merchant signup consent
step** — the one change here to a currently-working flow.
**Done when:** a withdrawal deactivates the account, revokes sessions, deletes saved addresses, and
leaves completed orders intact; and every deep-read appears in `/superadmin/audit-logs`.

**Sprint 9 — Mobile. No DB change. Largest UI sprint.**
Customer auth (signup/OTP/login) in the `(customer)` stack; `bazarhq.customer.jwt` in
expo-secure-store; `X-Client: mobile` handshake; consent step; legal screens. **No Google
Sign-In** (§6.2).
**Then build mobile checkout**, which does not exist today (`cart.tsx:120` is a "Checkout coming
soon" placeholder) — delivery form, payment selection, review, order placement, with **both** the
account path and the guest path, matching web.
**Done when:** an order is placed from the app, both signed in and as a guest, and appears in the
merchant dashboard.
*Scope honestly: this is "build checkout on a new platform", not "add a gate". Consider splitting
into 9a (auth) and 9b (checkout) when you get here.*

**Sprint 10 — Google Sign-In. Web only. No DB change.**
Install `google-auth-library`. `POST /v1/customer/auth/google` with full ID-token verification
(§6.1), the linking rule (§6.3) and the edge cases (§6.4). Google Identity Services button on the
web signup and login pages, after the consent step. `GOOGLE_CLIENT_ID` +
`NEXT_PUBLIC_GOOGLE_CLIENT_ID`; **no client secret needed**.
**Done when:** a brand-new Google user gets an account with **no OTP sent**; an existing
password user signing in with Google lands in the *same* account; and the unverified-row guard
provably clears the stale password hash.
**Placement note:** this is last because it is a convenience path, not a dependency — nothing else
needs it. Its only real prerequisites are Sprint 2's columns and Sprint 3's session machinery, so
**it can be pulled forward to immediately after Sprint 4** if web signup conversion matters more
than the remaining visibility work. Nothing downstream changes either way.

---

## 12. Risk register — what touches production

### Touches the production database

| Sprint | Change | Risk |
|---|---|---|
| 0 | `email_sends` — one new empty table | **Very low.** New table, unread by anything else. Could be folded into Sprint 2 if you want Sprint 0 strictly DB-free — the cost is losing send visibility during the sprint that most needs it. |
| 2 | 3 new tables, 5 enums, 2 nullable columns on existing tables, 3 nullable Google columns, 4 FKs, ~10 indexes, 1 trigger | **Low.** New tables are empty and unread; nullable `ADD COLUMN` with no default is metadata-only; FKs target all-`NULL` columns. Apply-then-deploy. |
| 5 | FK + 2 indexes on `orders.customer_id` | **Low-medium.** `orders` is a live table. The column is 100% `NULL` so validation is instant, but this is the one live-table change. `ADD CONSTRAINT … NOT VALID` + `VALIDATE` if you want zero doubt. |

*Reminder from memory and `CLAUDE.md`: **local `api/.env` points at the production database** —
there is no dev DB. Any local `prisma db push`, seed or migration command mutates live data. All
schema work goes through generated SQL reviewed and applied by hand in Supabase.*

### Touches existing working features

| Sprint | What | Mitigation |
|---|---|---|
| 0 | **Transactional email starts actually sending.** Order confirmations, merchant new-order alerts, status updates and merchant verification links have never delivered a message in production; the moment the transport works, they do. | Desirable but **visible**. Real customers/merchants get mail they have never received. It also draws on the 500/day quota. If you want it staged, gate the four order/merchant senders behind `TRANSACTIONAL_EMAIL_ENABLED` and flip after the OTP path is proven (§2.7). |
| 0 | The Gmail account itself becomes a single point of failure for all platform mail | A Google lock takes down OTP *and* order mail. Keep volume low, never send marketing through it, watch `email_sends`. **Prefer a dedicated Gmail account over a personal one** (§2.4). |
| 1 | `FIRST_PARTY_PREFIXES` in `frontend/middleware.ts` | Append-only to an array. **Regression test: load `/privacy` with a `_dev_shop` cookie set.** Omitting this silently 404s the policy pages for storefront visitors. |
| 3 | `requireCustomer` starts checking session revocation | Invalidates existing phone-issued tokens (they have no session row). **Deliberate** — it closes §1.3 early. Land it close to Sprint 6's UI change, or accept that phone-token holders are signed out at Sprint 3. |
| 5 | **Checkout** — the highest-value flow on the platform | `POST /v1/orders/guest` is **not modified**. The new authed path is a *separate* endpoint. The checkout page branches; the guest branch keeps calling the same endpoint with the same body. Test guest **first** in every deploy check. |
| 6 | `POST /v1/customer/auth/login` contract changes | **The one intentional break.** Justified by §1.3 — re-verified as still present at time of writing. Order lookup via `/track` remains for anyone who only wanted to check an order. |
| 8 | Merchant signup gains a blocking consent checkbox | Additive field, but it *can* block a working signup. Test merchant registration end-to-end after deploy. |
| 9 | Mobile customer stack | New screens in the `(customer)` stack only. Merchant and admin tabs untouched. Keep it self-contained — no cross-tab navigation (expo-router throws "unmatched route"). |
| 10 | Google Sign-In linking into existing accounts | The §6.3 guard (clear `password_hash` when linking into an unverified row) is the security-critical line. Test it explicitly: create `pending_verification` with a password, sign in with Google for that address, confirm the old password no longer works. |

### Does the additive-only principle hold?

**Yes, with one stated exception.**

Additive throughout: every table is new; all new columns are nullable with no default; the FK lands
on a column that already exists and is entirely `NULL`; every endpoint in §10 is a new path; **guest
checkout's endpoint, request body and response are untouched from Sprint 0 to Sprint 10**; merchant,
storefront, marketplace and superadmin surfaces are unaffected. The Resend code is preserved rather
than removed.

The exception is **Sprint 6**, retiring the phone-only customer login. That is not additive, and it
is not an accident — it is the removal of the authentication bypass in §1.3, which is the security
reason this phase exists. It is isolated to one handler, sequenced after real accounts are
available, and leaves order tracking intact.

*(Sprint 0's transactional email going live is a behaviour change but not a contract change: those
senders were always intended to send, and no caller, response or schema changes. It is flagged
above so it is not a surprise.)*

### Open questions to resolve before building

1. **Dedicated Gmail account vs. personal** (§2.4). Recommendation: dedicated — same zero cost,
   much smaller blast radius if the app password leaks.
2. **Data residency** (§8.6). Could invalidate the architecture, not just the copy. Answer before
   Sprint 2.
3. **Legal review** of §8 in full — consent wording, lawful bases, retention periods.
4. **Hosting regions** for Render, Vercel and Upstash — confirm from each dashboard before
   publishing the §8.2(c) table. Don't publish a guess.
5. **Stage transactional email or let it all go live in Sprint 0?** (§2.7 / §12). Recommendation:
   let it go live — it is what the code was written for — but know it is happening.
6. **Per-shop privacy policies** (§8.5) — recommendation is platform-only for v1; confirm.
7. **Pull Google Sign-In forward to after Sprint 4?** (§11 Sprint 10 placement note.) Only if web
   signup conversion is the priority.
