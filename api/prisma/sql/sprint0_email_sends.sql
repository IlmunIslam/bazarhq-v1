-- Sprint 0 — email_sends send log (design doc §7.6)
--
-- STRICTLY ADDITIVE. One new, empty table. Nothing is dropped, renamed, or
-- retyped; no existing column is touched; no data is migrated. Every existing
-- query returns exactly what it returns today.
--
--   • CREATE TABLE  email_sends        (new, empty)
--   • CREATE INDEX  x3                 (all on the new table)
--   • CREATE TYPE   none               (status is TEXT, not an enum, on purpose)
--
-- Why this table exists: the platform now sends through Gmail SMTP, which
-- publishes NO delivery webhooks — bounces arrive as human-readable messages in
-- the platform inbox and nothing is machine-readable. This log is the only
-- programmatic record that a send was accepted, and the only way to answer
-- "the verification code never arrived". It also backs the daily-quota
-- diagnostics (§2.4).
--
-- PRIVACY: the recipient is stored as a SHA-256 hash (to_email_hash), never as
-- an address. Note the honest limit — an email address is low-entropy, so this
-- resists casual disclosure but is not anonymisation against someone testing a
-- known address.
--
-- The OTP code itself is never stored here, or anywhere else in this table:
-- the row records only a template name, a status, and the provider message id.
--
-- This project syncs schema with `prisma db push` (there is no prisma/migrations
-- history, and render.yaml has NO preDeployCommand — nothing migrates on deploy).
-- This file is the exact SQL of the delta, generated with:
--
--   prisma migrate diff \
--     --from-schema-datamodel <schema.prisma @ HEAD> \
--     --to-schema-datamodel   prisma/schema.prisma \
--     --script
--
-- APPLY ORDER: run this SQL against the database FIRST, then deploy the API.
-- A new table is invisible to the running code, so there is no window in which
-- the app expects something the database lacks. Deploying first WOULD open one:
-- the send-logging write would fail until the table appeared (it is wrapped in
-- a try/catch and would not break sends, but every send would log an error).
--
-- LOCK PROFILE: CREATE TABLE takes a lock on nothing that exists; all three
-- indexes are built on an empty table. Sub-millisecond, no rewrite, no
-- contention with live traffic.
--
-- ROLLBACK: DROP TABLE "email_sends";   -- safe; nothing references it.

-- CreateTable
CREATE TABLE "email_sends" (
    "id" TEXT NOT NULL,
    "to_email_hash" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_sends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_sends_created_at_idx" ON "email_sends"("created_at");

-- CreateIndex
CREATE INDEX "email_sends_to_email_hash_created_at_idx" ON "email_sends"("to_email_hash", "created_at");

-- CreateIndex
CREATE INDEX "email_sends_template_status_created_at_idx" ON "email_sends"("template", "status", "created_at");
