-- Sprint C0 — Global taxonomy + spec templates + per-product spec values
--
-- STRICTLY ADDITIVE. Nothing is dropped, renamed, or retyped. No data is
-- migrated. Every existing query returns exactly what it returns today.
--
--   • CREATE TYPE   "SpecDataType"
--   • CREATE TABLE  categories, spec_fields, product_specs   (all new, all empty)
--   • ALTER TABLE   products ADD COLUMN global_category_id TEXT   (nullable, NO default)
--   • CREATE INDEX  x7  (all on new tables except products_global_category_id_status_idx)
--   • ADD FOREIGN KEY x5
--
-- shop_categories is NOT touched. The per-shop, merchant-owned category system
-- keeps working unchanged; this taxonomy sits alongside it. products.category_id
-- is untouched — the new column is a second, independent reference.
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
-- New tables are invisible to the currently running code, so there is no window
-- in which the deployed app expects something the database lacks.
--
-- LOCK NOTES (all trivial at current row counts, listed for completeness):
--   • ADD COLUMN nullable with no default is metadata-only in Postgres — no table
--     rewrite, no scan.
--   • ADD CONSTRAINT ... FOREIGN KEY on products takes a brief
--     SHARE ROW EXCLUSIVE lock and scans to validate. Every existing row has
--     global_category_id = NULL, so validation passes trivially. On a large table
--     you would instead add it NOT VALID and VALIDATE CONSTRAINT separately.
--   • CREATE INDEX takes a brief lock; use CREATE INDEX CONCURRENTLY at scale
--     (cannot run inside a transaction).

-- CreateEnum
CREATE TYPE "SpecDataType" AS ENUM ('text', 'number', 'boolean', 'enum');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "global_category_id" TEXT;

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spec_fields" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT,
    "data_type" "SpecDataType" NOT NULL DEFAULT 'text',
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_comparable" BOOLEAN NOT NULL DEFAULT true,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spec_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_specs" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "spec_field_id" TEXT NOT NULL,
    "value_text" TEXT,
    "value_number" DECIMAL(14,4),
    "value_bool" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_specs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_sort_order_idx" ON "categories"("parent_id", "sort_order");

-- CreateIndex
CREATE INDEX "spec_fields_category_id_sort_order_idx" ON "spec_fields"("category_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "spec_fields_category_id_key_key" ON "spec_fields"("category_id", "key");

-- CreateIndex
CREATE INDEX "product_specs_spec_field_id_idx" ON "product_specs"("spec_field_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_specs_product_id_spec_field_id_key" ON "product_specs"("product_id", "spec_field_id");

-- CreateIndex
CREATE INDEX "products_global_category_id_status_idx" ON "products"("global_category_id", "status");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_global_category_id_fkey" FOREIGN KEY ("global_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_fields" ADD CONSTRAINT "spec_fields_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_specs" ADD CONSTRAINT "product_specs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_specs" ADD CONSTRAINT "product_specs_spec_field_id_fkey" FOREIGN KEY ("spec_field_id") REFERENCES "spec_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
