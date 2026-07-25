-- Sprint M1 — Marketplace API foundation
-- Additive index migration. NON-DESTRUCTIVE: CREATE INDEX only.
-- No column changes, no data changes, no drops.
--
-- This project syncs schema with `prisma db push` (there is no prisma/migrations
-- history and no `migrate deploy` in the Render build). These indexes are added
-- to schema.prisma as @@index and applied via `prisma db push`. This file is the
-- exact SQL that `db push` will run (generated with `prisma migrate diff`), kept
-- for review.
--
-- To apply manually against the DB instead of db push, run these two statements.
-- At larger scale, prefer CREATE INDEX CONCURRENTLY (cannot run inside a txn).

-- CreateIndex
CREATE INDEX "shops_status_published_at_idx" ON "shops"("status", "published_at");

-- CreateIndex
CREATE INDEX "products_status_created_at_idx" ON "products"("status", "created_at");
