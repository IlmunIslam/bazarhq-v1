# BazarHQ Product Comparison + Per-Category Spec Templates — Design Document

> Status: **design only / nothing built** · No code, no migrations, no installs were produced for this document.
> Scope rule for this phase: every schema change is **additive**. No existing column changes type or
> meaning, no existing endpoint changes its response contract, and the merchant dashboard,
> per-shop storefronts, marketplace and superadmin apps must keep working untouched at every stage.

---

## Executive summary

The comparison feature itself is straightforward. **The blocker is underneath it.**

Comparable specs require products from different shops to agree on what "Electronics" means.
Today they cannot: categories are **per-shop, free-form strings** created by each merchant. Two
shops selling phones produce two unrelated `shop_categories` rows with different UUIDs and
whatever names the merchants typed. There is no shared taxonomy to hang spec templates on.

`docs/marketplace-plan.md` already found this and deliberately deferred it — it lists
"Global category taxonomy / cross-shop category browse" under **Defer (explicitly out of v1)**,
with the note *"no canonical taxonomy exists."* This mini-phase is where that deferral comes due.

So the honest shape of this work is:

> **~40% of it is building the global taxonomy that should exist anyway. ~60% is the comparison
> feature proper.** The taxonomy is the foundation; nothing else can be built first, and it is the
> piece that carries real risk.

The second finding is operational and matters more than it looks: **this project has no migration
pipeline.** There is no `api/prisma/migrations/` directory, and `render.yaml` has no
`preDeployCommand` — schema reaches production through `prisma db push`, run by hand. This feature
adds four tables and one column. That needs a deliberate, reviewed apply step, not a `db push` on a
Friday.

Everything else is additive and safe.

---

## 1. Categories — the foundational finding

### What exists today

```prisma
model ShopCategory {
  id        String @id @default(uuid())
  shopId    String @map("shop_id")     // ← per-shop
  name      String                     // ← free-form, merchant-typed
  slug      String
  sortOrder Int    @default(0)
  products  Product[]
  @@unique([shopId, slug])             // ← slugs only unique WITHIN a shop
}
```

| Question | Answer |
|---|---|
| Global or per-shop? | **Per-shop.** Every row is owned by one `shopId`. |
| Fixed list or free-form? | **Free-form.** `POST /v1/products/categories` takes any `name` (1–50 chars) and slugifies it (`api/src/routes/products.ts:54`). |
| Shared vocabulary? | **None.** Shop A's "Electronics" and Shop B's "electronics" are different rows with different IDs. |
| Does the marketplace expose category? | **No.** `GET /v1/marketplace/products` (`marketplace.ts:136-149`) doesn't select or filter on it. |
| Cross-shop category browse? | Does not exist. |

### Why this blocks spec templates

A spec template must attach to a category *that means the same thing everywhere*. Attaching
templates to `ShopCategory` would mean:

- Every merchant re-defines "RAM / Screen size / Battery" for their own private category — enormous
  duplicated effort, and no two shops would spell them the same.
- Comparison rows across shops would never align, which is the entire point of the feature.
- Superadmin could not curate a taxonomy, because there'd be thousands of merchant-owned rows.

**Conclusion: a global taxonomy must be introduced first. This is a prerequisite sprint, not a
detail of the comparison work.**

### Recommended approach — additive, non-destructive

**Do not migrate, rename or repurpose `ShopCategory`.** It does real work today: storefront
navigation (`storefront.ts:51`), the merchant product form's category chips, and per-shop
merchandising. Merchants should keep arranging their own store however they like.

Instead, introduce a **parallel global taxonomy** and let a product carry both:

| Concept | Table | Owner | Purpose |
|---|---|---|---|
| Shop category | `shop_categories` (exists, untouched) | Merchant | How *this shop* organises its own storefront |
| Marketplace category | `categories` (**new**) | Superadmin | Shared taxonomy — drives spec templates + comparison |

A product gets a new nullable `global_category_id`. The two are independent: a merchant can file a
phone under their own "New Arrivals" *and* tag it as marketplace `electronics/mobile-phones`.

Rejected alternatives, for the record:

- **Promote `ShopCategory` to global** — destructive. Breaks `@@unique([shopId, slug])`, storefront
  filters, and every merchant's existing category list. Rejected.
- **Auto-map by name string** ("Electronics" → electronics) — silently wrong the moment someone
  types "Electronic Items" or a Bangla name. Could be offered later as a *suggestion* in the UI,
  never as automatic truth. Rejected as a mechanism.
- **Skip the taxonomy, let merchants define specs per product** — free-form keys never align, so
  comparison degrades to a list of unrelated attributes. This is the thing that makes comparison
  features feel broken. Rejected.

### Optional convenience (later, not sprint C0)

`ShopCategory.suggestedGlobalCategoryId` — a merchant maps their "Phones" category to the global
`mobile-phones` once, and the product form pre-selects it for every product in that category. Pure
UX sugar; additive nullable column; defer to polish.

---

## 2. Schema design

### Current `Product`

```prisma
model Product {
  id, shopId, categoryId?, name, slug, description,
  basePrice Decimal, compareAtPrice Decimal?, tags String[],
  status ProductStatus, hasVariants Boolean, stock Int, createdAt, updatedAt
  images ProductImage[], variants ProductVariant[], orderItems OrderItem[]
}
```

Attributes today are **unstructured**: `description` (prose) and `tags String[]` (flat, free-form,
searched with `has`). `ProductVariant` is *purchasable options* (name/sku/price/stock) — a different
concept from specs and **must not be conflated with them**. A variant changes what you buy; a spec
describes what it is.

There is nowhere structured for specs to live. Hence new tables.

### Proposed models (all new except one nullable column)

```prisma
// ─── Global taxonomy (superadmin-owned) ──────────────────────────────────────
model Category {
  id        String   @id @default(uuid())
  slug      String   @unique                        // globally unique, unlike ShopCategory
  name      String
  parentId  String?  @map("parent_id")              // 2 levels max (see note)
  sortOrder Int      @default(0) @map("sort_order")
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  parent     Category?   @relation("CategoryTree", fields: [parentId], references: [id])
  children   Category[]  @relation("CategoryTree")
  specFields SpecField[]
  products   Product[]

  @@index([parentId, sortOrder])
  @@map("categories")
}

// ─── Spec template: one row per field in a category's template ───────────────
model SpecField {
  id           String       @id @default(uuid())
  categoryId   String       @map("category_id")
  key          String                                  // stable machine key: "ram_gb"
  label        String                                  // display: "RAM"
  unit         String?                                 // "GB", "inch", "mAh"
  dataType     SpecDataType @default(text) @map("data_type")
  options      String[]     @default([])               // for dataType=enum
  sortOrder    Int          @default(0) @map("sort_order")
  isComparable Boolean      @default(true)  @map("is_comparable")  // show as a compare row
  isRequired   Boolean      @default(false) @map("is_required")
  isActive     Boolean      @default(true)  @map("is_active")      // soft delete
  createdAt    DateTime     @default(now()) @map("created_at")

  category Category      @relation(fields: [categoryId], references: [id])
  values   ProductSpec[]

  @@unique([categoryId, key])
  @@index([categoryId, sortOrder])
  @@map("spec_fields")
}

enum SpecDataType {
  text
  number
  boolean
  enum
}

// ─── Per-product spec values ─────────────────────────────────────────────────
model ProductSpec {
  id          String   @id @default(uuid())
  productId   String   @map("product_id")
  specFieldId String   @map("spec_field_id")
  valueText   String?  @map("value_text")
  valueNumber Decimal? @map("value_number") @db.Decimal(14, 4)
  valueBool   Boolean? @map("value_bool")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  product   Product   @relation(fields: [productId], references: [id], onDelete: Cascade)
  specField SpecField @relation(fields: [specFieldId], references: [id])

  @@unique([productId, specFieldId])
  @@index([specFieldId])
  @@map("product_specs")
}
```

Plus **one nullable column on an existing table**:

```prisma
model Product {
  // …everything unchanged…
  globalCategoryId String?   @map("global_category_id")
  globalCategory   Category? @relation(fields: [globalCategoryId], references: [id])
  specs            ProductSpec[]

  @@index([globalCategoryId, status])   // marketplace category browse + compare
}
```

### Value storage: typed columns vs JSONB — and why

| | **EAV (`product_specs`, recommended)** | JSONB column on `products` |
|---|---|---|
| Integrity | FK to `spec_fields`; can't store a key the template doesn't define | none — typos and orphan keys accumulate silently |
| Numeric compare ("more RAM wins") | `value_number` is a real Decimal — sortable, filterable | needs casting on every read |
| Future faceted filters ("RAM ≥ 8GB") | indexable | GIN index, awkward typed queries |
| Template rename | label lives in `spec_fields`, values untouched | every product row must be rewritten |
| Read cost | one extra join | none |
| Write complexity | moderate | trivial |

**Recommendation: EAV.** The one real cost is a join; the benefits (integrity, numeric comparison,
future filtering) are exactly what a comparison feature needs. JSONB is the right call for a
throwaway prototype, not for the "full professional version" requested.

`@@unique([productId, specFieldId])` is what makes a bulk upsert safe and idempotent.

### Two-level depth note

`parentId` allows arbitrary nesting, but **the design assumes 2 levels** (Electronics → Mobile
Phones) and spec templates attach to **leaf categories only**. Deeper trees raise the question of
whether specs inherit down the tree — real complexity for no near-term value. Enforce 2 levels in
validation; the column supports more later if ever needed.

### Migration safety

| Change | Type | Risk |
|---|---|---|
| `CREATE TABLE categories` | additive | none |
| `CREATE TABLE spec_fields` | additive | none |
| `CREATE TABLE product_specs` | additive | none |
| `CREATE TYPE spec_data_type` (enum) | additive | none |
| `ALTER TABLE products ADD COLUMN global_category_id uuid NULL` | **touches an existing table** | low — nullable with no default is a metadata-only change in Postgres, no table rewrite, no lock of consequence at this size |
| `CREATE INDEX products_global_category_id_status_idx` | additive | brief lock; trivial at current row counts |

**No column is dropped, renamed, retyped, or given a new meaning. No data is migrated.** Every
existing query continues to return exactly what it returns today.

### ⚠️ Operational risk: there is no migration pipeline

- `api/prisma/migrations/` **does not exist**. The project syncs schema with `prisma db push`.
- `render.yaml` has **no `preDeployCommand`** — the build runs `prisma generate && tsc` only.
  CLAUDE.md's claim that *"Prisma migrations run as a pre-deploy hook"* is **not accurate** for the
  current blueprint. Worth correcting in CLAUDE.md regardless of this feature.
- The established convention is `api/prisma/sql/<sprint>_<name>.sql` holding the reviewed SQL —
  see `m1_marketplace_indexes.sql`, which documents exactly this situation.

**Requirement for this phase:** each schema-touching sprint ships a reviewed
`api/prisma/sql/cN_*.sql` generated with `prisma migrate diff`, applied deliberately against
production, with the app deployed *after* the tables exist. New tables are invisible to running
code, so apply-then-deploy is safe and needs no downtime.

---

## 3. Who defines templates

**The superadmin.** Categories are a shared taxonomy and spec templates are editorial decisions
about what makes products comparable — that is platform curation, not merchant configuration. If
merchants could edit templates, alignment collapses immediately.

Does the system support this today? **Partially.** The superadmin panel exists on web
(`/superadmin/*`) and now on mobile (the `(admin)` tab), with `requireAdmin`, TOTP, audit logging
and the `X-Client` handshake all working. But there are **no category or template screens anywhere**
— they're entirely new surface.

Recommended authoring surfaces:

| Surface | Scope | Rationale |
|---|---|---|
| **Web superadmin** — Taxonomy | Category CRUD, reorder, activate/deactivate | Authoring a taxonomy is a desk task |
| **Web superadmin** — Spec template editor | Per-category `SpecField` CRUD: label, key, unit, dataType, enum options, order, comparable/required flags | Dense form — genuinely bad on a phone |
| **Mobile admin** | **Read-only** view of taxonomy + templates | Parity of *visibility*, not authoring. Defer to polish; not required for the feature to work |

Every template mutation should write to `audit_logs` via the existing `writeAuditLog` service —
consistent with how merchant suspension and announcements already behave.

**Open question for you:** who supplies the initial taxonomy? A useful Bangladesh-market starter
(Electronics, Mobile Phones, Clothing, Home & Kitchen, Beauty, Groceries…) with ~5–8 spec fields
each is a *content* task, not an engineering one, and it gates the feature being useful. Options:
seed script with a starter set, or you author it through the admin UI in C1. **Recommend: a seed
script with a small starter taxonomy, editable afterwards** — it makes C2 onward testable
immediately.

---

## 4. API surface

All **additive**. No existing endpoint changes shape; two gain optional fields (purely additive,
existing clients ignore them).

### Admin — taxonomy (`requireAdmin`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/admin/categories` | Full tree incl. inactive, with product + field counts |
| POST | `/v1/admin/categories` | Create (name, slug, parentId?, sortOrder) |
| PATCH | `/v1/admin/categories/:id` | Rename, reorder, reparent, activate/deactivate |
| DELETE | `/v1/admin/categories/:id` | **Soft delete** (`isActive=false`). Hard delete refused when products reference it |

### Admin — spec templates (`requireAdmin`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/admin/categories/:id/spec-fields` | Template incl. inactive fields |
| POST | `/v1/admin/categories/:id/spec-fields` | Add a field |
| PATCH | `/v1/admin/spec-fields/:id` | Edit label/unit/order/flags. **`key` and `dataType` immutable once values exist** |
| DELETE | `/v1/admin/spec-fields/:id` | Soft delete — preserves historical values |

### Public — taxonomy + template (no auth)

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/categories` | Active taxonomy tree. Used by merchant form, marketplace filter, compare |
| GET | `/v1/categories/:id/spec-fields` | Active template for one category — drives the dynamic form |

Public because the merchant form (merchant JWT), the mobile app and the marketplace (anonymous) all
need it, and none of it is sensitive. Behind `publicRateLimit`, consistent with other public routes.

### Merchant — spec values (`requireMerchant`)

| Method | Path | Purpose |
|---|---|---|
| PUT | `/v1/products/:id/specs` | **Bulk replace** all specs for a product |
| PATCH | `/v1/products/:id` | Gains optional `globalCategoryId` in the accepted body |

`PUT …/specs` deliberately mirrors the existing bulk-replace pattern of
`POST /v1/products/:id/variants` — same mental model, one round trip, idempotent via the
`@@unique([productId, specFieldId])` upsert. Body:

```json
{ "specs": [ { "specFieldId": "…", "value": "8" }, { "specFieldId": "…", "value": true } ] }
```

Server validates each value against its field's `dataType` (and `options` for enums) and routes it
into `valueText` / `valueNumber` / `valueBool`. Rejects `specFieldId`s that don't belong to the
product's `globalCategoryId` — that guard is what stops the data drifting.

### Customer — comparison (no auth)

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/marketplace/compare?ids=a,b,c,d` | N products (**max 4**) with resolved specs, category, shop |

Returns products **plus** a merged, ordered `specRows` array so both clients render the same rows in
the same order without duplicating merge logic:

```json
{ "products": [ { "id","name","slug","basePrice","compareAtPrice","image",
                  "shop": {"name","subdomain"},
                  "category": {"id","name","slug"},
                  "specs": { "<specFieldId>": "8 GB" } } ],
  "specRows":  [ { "specFieldId","label","unit","dataType","categoryId" } ],
  "sharedCategoryId": "…" | null }
```

Enforces the same visibility rule as the rest of the marketplace:
`status='active' AND shop.status='published'`. Unknown or hidden IDs are silently dropped, not
errored — a stale saved comparison link should degrade, not 404.

### Additive changes to existing endpoints

| Endpoint | Change | Breaking? |
|---|---|---|
| `GET /v1/marketplace/products` | adds `category` to each item; accepts optional `?category=<slug>` | **No** — new field, new optional param |
| `GET /v1/products/:id` (merchant) | adds `globalCategoryId` + `specs[]` | **No** — new fields |
| `GET /v1/storefront/:sub/products/:slug` | adds `specs[]` (for a spec table on the product page, optional) | **No** — new field |

---

## 5. Merchant spec entry

### The form change

Both product forms (`frontend/app/dashboard/products/_components/ProductForm.tsx` and
`mobile/src/components/ProductForm.tsx`) gain a **Marketplace category** selector *alongside* — not
replacing — the existing shop-category chips, followed by a **Specifications** section that renders
from the selected category's template.

Field rendering by `dataType`:

| dataType | Web | Mobile |
|---|---|---|
| `text` | text input | `TextInput` |
| `number` | number input with `unit` as suffix adornment | `TextInput keyboardType="decimal-pad"` + unit label |
| `boolean` | toggle | `Pressable` segmented Yes/No |
| `enum` | select | chip row (matches the existing status/category chip pattern) |

### Save sequencing

The existing form already does *create product → save variants*. Specs slot in as a third step:

```
create/update product (incl. globalCategoryId) → save variants → PUT specs
```

Same failure discipline the image upload already uses: the product is saved first, and a spec
failure leaves the product intact with an inline retry rather than losing the merchant's work.

### Edge cases — all must be designed for, not discovered

| Case | Handling |
|---|---|
| **Category has no template yet** | Friendly empty state: *"No specification fields defined for this category yet."* Product saves normally. **This is the default state at launch** and must not look like an error |
| **No marketplace category selected** | Specs section hidden entirely. Product saves — `globalCategoryId` is nullable by design |
| **Merchant changes category after entering specs** | Old values belong to the old category's fields. Warn explicitly (*"Specs for the previous category will be cleared"*) and clear on confirm. Silent data loss here would be the worst bug in the feature |
| **Admin adds a field to a category later** | Existing products simply have no value for it — renders as `—`. No backfill, no migration |
| **Admin soft-deletes a field** | Values retained in DB, hidden from form and comparison. Reversible |
| **Required field left empty** | Warn but **do not block saving.** Blocking would strand merchants whose products predate the template |

---

## 6. Comparison UX

### Selection — where it lives

A **Compare** toggle on marketplace product cards (web `ProductCard.tsx`, mobile the `ProductCard`
in `(customer)/index.tsx`), plus one on the storefront product detail page.

Storage mirrors the cart exactly — a pattern already proven in this codebase:

| | Web | Mobile |
|---|---|---|
| Store | `localStorage`, key `compare` | `AsyncStorage`, key `compare` |
| State | React context, marketplace-scoped | React context in the customer stack |
| Cap | **4 products** | **3 products** |

Cross-shop by nature, so unlike the cart it is **not** keyed by subdomain. Persisting across reloads
matters — customers browse, wander off, come back.

When ≥2 are selected, a **floating compare tray** docks to the bottom: thumbnails, individual
remove, "Clear all", and a primary **Compare (n)** button. Selecting beyond the cap explains the
limit rather than silently ignoring the tap.

### Web comparison view — `/marketplace/compare`

Wide table, the conventional and correct pattern on desktop:

```
┌──────────────┬────────────┬────────────┬────────────┐
│              │ Product A  │ Product B  │ Product C  │  ← sticky header row
│              │  [image]   │  [image]   │  [image]   │
│              │  Shop name │  Shop name │  Shop name │
├──────────────┼────────────┼────────────┼────────────┤
│ Price        │ ৳12,000    │ ৳14,500    │ ৳11,200    │  ← always shown
│ Discount     │ −10%       │ —          │ −25%       │
│ Category     │ Phones     │ Phones     │ Phones     │
├──────────────┼────────────┼────────────┼────────────┤
│ RAM          │ 8 GB       │ 6 GB       │ 8 GB       │  ← from template
│ Screen size  │ 6.5 inch   │ 6.1 inch   │ 6.7 inch   │
│ Battery      │ 5000 mAh   │ 4500 mAh   │ 5000 mAh   │
└──────────────┴────────────┴────────────┴────────────┘
```

- First column sticky; product columns scroll horizontally past ~3 on narrow viewports.
- **"Highlight differences" toggle** — dims rows where all values match. The single highest-value
  affordance in any comparison UI.
- Missing value renders `—`, never blank (blank reads as broken).
- Each column footer: "View product" → existing storefront deep link. Comparison is a *discovery*
  surface; buying still happens in the shop's own storefront, consistent with the marketplace's
  established boundary.

### Mobile comparison view

**A wide table transplanted to a phone is the failure mode to avoid.** Recommended pattern:
**stacked spec cards** — one card per attribute, products as columns *within* the card:

```
┌─────────────────────────────┐
│ RAM                         │
│ ┌────────┬────────┬───────┐ │
│ │  8 GB  │  6 GB  │  8 GB │ │
│ │   A    │   B    │   C   │ │
│ └────────┴────────┴───────┘ │
└─────────────────────────────┘
```

- A sticky product header at the top (thumbnail + short name + price) so the columns stay
  identifiable while scrolling attributes.
- Cap of **3** products is what makes columns legible at ~110px each; 4 is too tight on a 360px
  screen.
- Same "differences only" filter, as a segmented toggle.
- Vertical scrolling only — no horizontal scroll, no pinch-zoom table.

Alternative considered: a horizontally paged two-product view (A vs B, swipe to A vs C). Cleaner
per screen but hides the third product and makes "which is cheapest" require memory. **Recommend
stacked cards.**

### Mixed categories — degrade, don't block

Customers *will* select a phone and a shirt. Behaviour:

1. **Always show the common rows** — price, discount, category, shop, image. Universally meaningful.
2. **Spec rows only when a shared category exists.** With ≥2 categories present, group spec rows
   under a category subheading and render `—` for products outside it.
3. **An honest inline banner:** *"These products are in different categories, so only price and
   general details can be compared."* Not an error, not a modal.
4. **Never block the selection.** Refusing to compare across categories is more annoying than a
   sparse table.

`sharedCategoryId` in the compare response tells both clients which mode to render without either
re-deriving the rule.

---

## 7. Existing data

**Every product today has `globalCategoryId = NULL` and zero `product_specs` rows.** After the
migration, nothing about them changes — the column is nullable, the tables are empty, and no
existing query selects them.

In the comparison view they show **common rows only** (price, discount, shop) with `—` for specs.
That is legitimate and readable — not an error state.

**Is a backfill needed? No — and an automated one is a bad idea.** Guessing that a shop category
named "Electronics" means the global `electronics` node is exactly the kind of silent mis-mapping
that poisons a taxonomy. String-matching merchant-typed names is unreliable across spelling, case,
Bangla/English mixing, and shop-specific naming.

Recommended adoption path instead:

1. **Merchant-driven, gradual.** Marketplace category is an optional field on a form merchants
   already use. Products acquire it as they're edited.
2. **A dashboard nudge** (polish sprint): *"12 of your products aren't in a marketplace category —
   add one so shoppers can compare them."*
3. **An admin-assisted mapping tool** (optional, later): superadmin maps a shop category to a global
   one and bulk-applies to that shop's products, with an explicit confirm. Human-reviewed, not
   automatic.
4. **Never** a silent bulk `UPDATE` inferred from strings.

Coverage will start near zero and that's expected. The feature must be designed to look correct with
sparse data — which the `—` handling and the "no template yet" empty state deliver.

---

## 8. Staged build plan

Seven sprints. Each is independently testable and leaves production working.

### C0 — Taxonomy foundation (backend only) ⚠️ *touches production DB*
- Add `Category`, `SpecField`, `SpecDataType` to `schema.prisma`.
- Reviewed SQL at `api/prisma/sql/c0_taxonomy.sql`; apply deliberately; deploy after.
- Admin CRUD endpoints for categories + spec fields; public `GET /v1/categories` and
  `GET /v1/categories/:id/spec-fields`.
- Seed script with a starter Bangladesh taxonomy.
- **Testable with curl. Zero UI. Nothing user-visible changes.**
- *Risk touchpoint: two new tables + one enum. Additive only.*

### C1 — Admin taxonomy + template management (web superadmin)
- `/superadmin/taxonomy` — category tree CRUD, reorder, activate.
- `/superadmin/taxonomy/[id]` — spec field editor.
- Audit logging on every mutation.
- **Testable: you author a real taxonomy through the UI.**

### C2 — Spec storage + merchant API ⚠️ *touches production DB*
- Add `ProductSpec` + `Product.globalCategoryId` + index.
- Reviewed SQL at `api/prisma/sql/c2_product_specs.sql`.
- `PUT /v1/products/:id/specs`; `globalCategoryId` accepted on product create/update; specs
  included in product GET responses.
- **Testable with curl.**
- *Risk touchpoint: one new table + one nullable column on `products` — the only existing table
  touched in the whole phase.*

### C3 — Merchant spec entry UI
- **C3a web**, **C3b mobile** — the same dynamic form on both, web first as the reference.
- Marketplace category selector + template-driven fields + all §5 edge cases.
- **Testable: enter specs on a real product, verify via API.**

### C4 — Comparison selection
- Compare toggle on marketplace cards + storefront detail; compare context; persistent storage;
  floating tray. **Web then mobile.**
- No comparison view yet — the tray's button can land on a stub.
- **Testable: select/deselect, cap enforcement, survives reload.**

### C5 — Comparison view
- `GET /v1/marketplace/compare` (additive endpoint).
- Web `/marketplace/compare` table; mobile stacked-card screen.
- Mixed-category degradation.
- **This is the sprint where the feature becomes real.**

### C6 — Polish
- "Differences only" toggle; marketplace category filter + browse-by-category;
  `ShopCategory.suggestedGlobalCategoryId` prefill; merchant coverage nudge; optional spec table on
  storefront product pages; mobile admin read-only template view.

### Recommended order

**C0 → C1 → C2 → C3 → C4 → C5 → C6**, strictly. C0/C1 before C2 because there's no point storing
spec values before templates exist to validate them against. **C4 before C5** deliberately:
selection is independently useful and testable, and it de-risks C5 by settling the storage question
first.

Sensible pause points if scope needs cutting: **after C3** you have a structured taxonomy and
merchant spec entry — real value, no comparison UI. **After C5** the feature is complete; C6 is
genuinely optional.

---

## 9. Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **No migration pipeline** — no `prisma/migrations/`, no `preDeployCommand`; schema reaches prod via manual `db push` | **High** | Reviewed `prisma/sql/cN_*.sql` per sprint; apply-then-deploy; new tables are invisible to running code. Separately: correct CLAUDE.md |
| 2 | Taxonomy is a prerequisite, not a detail — the phase is bigger than it looks | **High** | Called out up front; C0/C1 sized as their own sprints |
| 3 | `ALTER TABLE products ADD COLUMN` on a live table | Low | Nullable, no default → metadata-only in Postgres, no rewrite |
| 4 | **Two category concepts confuse merchants** ("shop category" vs "marketplace category") | Medium | Distinct labels + helper text; `suggestedGlobalCategoryId` prefill in C6. Worth usability-checking in C3 |
| 5 | Empty taxonomy makes the feature look broken at launch | Medium | Seed a starter taxonomy in C0; explicit "no template yet" empty state |
| 6 | Spec field deletion orphaning values | Low | Soft delete (`isActive`); never hard-delete a field with values |
| 7 | `key`/`dataType` edited after values exist | Medium | Immutable once any `ProductSpec` references the field — enforce server-side |
| 8 | Compare endpoint cost (4 products × specs × shop) | Low | Capped at 4; single query with includes; indexed |
| 9 | Sparse spec coverage early on | Medium | `—` rendering everywhere; adoption nudge in C6; no automated backfill |
| 10 | Mobile comparison legibility | Medium | Stacked cards, cap 3, no horizontal table |
| 11 | Scope creep into faceted marketplace filtering | Medium | Explicitly out of scope — the schema supports it later; don't build it now |

---

## 10. Explicitly out of scope

- Faceted marketplace filtering by spec ("RAM ≥ 8GB") — the schema enables it; not this phase.
- Spec-based search ranking.
- Merchant-defined custom spec fields — would break alignment by design.
- Auto-extraction of specs from descriptions.
- Comparison of variants within one product.
- Saved/shareable comparison links (a `?ids=` URL gets this nearly free on web; not designed here).
- Deep category trees (>2 levels) and spec inheritance.
- Mobile admin *authoring* of templates (read-only view only, C6).

---

## Decisions needed before C0

1. **Approve the parallel-taxonomy approach** (§1) — `ShopCategory` untouched, new global
   `categories` table, products carry both. This is the load-bearing decision.
2. **Approve EAV over JSONB** for spec values (§2).
3. **Who authors the initial taxonomy** (§3) — recommend a seed script with a starter set that you
   then edit through the C1 admin UI.
4. **Confirm the migration process** (§2, risk 1) — who applies the SQL to production, and when
   relative to deploy.
5. **Confirm comparison caps** — 4 on web, 3 on mobile.
