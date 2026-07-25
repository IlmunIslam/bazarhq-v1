# BazarHQ Marketplace Layer — Design Document

> Status: **approved plan / not yet built** · Design-only reference for the Marketplace phase.
> Scope rule for this phase: every change is **additive**. Existing tables' columns, existing
> API endpoints, and the merchant dashboard / per-shop storefronts / superadmin apps must not
> change behavior.

## Executive summary

The marketplace is almost entirely **additive**. The data already exists to query across shops,
checkout is already per-shop (which shapes the smart MVP), and nothing about the merchant
dashboard or per-shop storefronts needs to change. The single biggest risk isn't the database —
it's the **Next.js middleware**, which sticky-rewrites every path to a shop storefront and will
silently break new marketplace routes unless updated.

Core scoping recommendation: **the MVP marketplace is a discovery layer, not a new commerce
engine.** It helps shoppers find shops/products across all merchants, then **routes them into the
existing per-shop storefronts** (which already handle cart + checkout). No unified cross-shop cart
in v1. That is the smallest thing that delivers the vision.

---

## 1. Database

### What exists today
- `Shop` — `status` (`draft|published|suspended`), `publishedAt`, `subdomain` (unique), `name`,
  `description`, `logoUrl`. Indexes: `subdomain`, unique `userId`.
- `Product` — `shopId`, `status` (`draft|active|archived`), `name`, `description`, `tags String[]`,
  `basePrice`. Indexes: `@@unique([shopId, slug])`, `@@index([shopId, status])`.
- `PageView` — `shopId`, `path`, `createdAt`, indexed `[shopId, createdAt]`. **Already collected**
  on storefront home + product detail.
- `Order` — `shopId`, `status`, `createdAt`, indexed `[shopId, createdAt]` and `[shopId, status]`.

### Can we already query cross-shop?
**Yes, logically.** "All published shops" = `Shop where status='published'`. "All products across
shops" = `Product where status='active' AND shop.status='published'`. No schema change is *required*
to make these queries return correct data.

### What's missing — indexes (all additive, safe)
Existing indexes are **shop-scoped** (leading column `shopId`), so they can't serve cross-shop
filters efficiently:

| Need | Current | Recommended additive index |
|---|---|---|
| List/sort all published shops | none on `status`/`publishedAt` | `@@index([status, publishedAt])` on `Shop` |
| Browse/sort all active products | `[shopId, status]` — leading col unusable for status-only | `@@index([status, createdAt])` on `Product` |
| Product text search (later) | none | `pg_trgm` GIN on `name` (defer — see §5) |

**Migration risk assessment:** these are **`CREATE INDEX` only — additive, non-destructive, no data
migration, no column changes.** Zero risk to existing rows. Caveat: Render runs
`prisma migrate deploy` as a pre-deploy hook, and a plain `CREATE INDEX` takes a brief lock. On the
current tiny tables this is milliseconds; at scale you'd want `CREATE INDEX CONCURRENTLY` (which
Prisma doesn't emit by default — needs a hand-edited migration). **For MVP: accept the brief lock,
tables are small.** (See Risks.)

### What is NOT needed for MVP
- **No `featured` column** — derive popularity instead (§3). A curated-featured flag is a clean
  additive `Shop.featuredAt DateTime?` later.
- **No global category table.** Categories today are `ShopCategory` (per-shop; slugs collide across
  shops). There is no cross-shop taxonomy, and we recommend **not inventing one for v1** (§5).
- **No `shop_stats` materialized table** — compute rankings on the fly first; materialize only if
  it gets slow.

---

## 2. API — new endpoints (all additive)

New router mounted at **`/v1/marketplace`**. Existing routers (`/storefront`, `/orders`, `/shops`,
…) are **untouched** — the working web + mobile apps keep calling exactly what they call today.

| New endpoint | Purpose | How it differs from existing |
|---|---|---|
| `GET /marketplace/shops?sort=popular\|newest&cursor=&limit=` | Paginated list of **all published shops** (card data: name, subdomain, logo, description, productCount) | `/storefront/:subdomain` returns **one** shop's *full* detail (theme, categories, payment methods). This is a **cross-shop list** with a **lighter** payload and no theme/payment. |
| `GET /marketplace/products?search=&sort=&cursor=&limit=` | Search/browse **products across all shops**; each item carries its **shop identity** (subdomain + shopName) so cards link correctly | `/storefront/:subdomain/products` is **scoped to one shop** and requires the subdomain. The marketplace version has **no shop scope** and **must** filter `shop.status='published'` + `product.status='active'` (join). |
| Popular/suggested shops | Served by `sort=popular` on `/marketplace/shops` — **not a separate endpoint** | Keeps the surface minimal. |

**Additive guarantee:** new path namespace, new router, no shared handlers modified. Existing
endpoints' request/response shapes are unchanged. The mobile Sprint 2 storefront and web storefront
continue to work identically.

**Critical correctness detail:** cross-shop product results **must** join and filter on
`shop.status = 'published'`. A product can be `active` while its shop is `draft`/`suspended` —
without the shop filter the marketplace would leak unpublished merchants' products. Also, product
`slug` is unique only per-shop (`@@unique([shopId, slug])`), so every marketplace product link must
carry **subdomain + slug**, never slug alone.

---

## 3. "Popular / Suggested" ranking — honest, from data we actually have

We do **not** have: reviews, ratings, favorites, click-through tracking, or purchase-conversion
data. Do not rank by invented signals.

**What we genuinely collect:**
- **Order count per shop** (`orders` table) — the strongest, most honest "popular" signal.
- **Page views per shop** (`page_views` table) — real traffic/interest proxy, already tracked.
- **Product count** — distinguishes a real store from an empty one.
- **`publishedAt`** — for "new this week".

**Proposed v1 ranking (simple + transparent):**
> Among published shops with ≥1 active product, sort by **order count (last 30 days) desc**,
> tie-break by **page views (last 30 days) desc**, then **`publishedAt` desc**.

- "**Suggested**" = same as "**Popular**" in v1 (no personalization — say so honestly;
  personalization needs per-user signals we don't collect).
- "**New**" = `publishedAt desc` (the `sort=newest` option).
- **Computation:** on-the-fly `groupBy(shopId)` aggregations at current scale — no new table. If it
  slows down, add a nightly-refreshed `shop_stats` cache (deferred).
- **Cold-start honesty:** with few orders, ranking leans on page views + recency. That's fine and
  truthful — no fake "trending" badges.

---

## 4. Web structure

### The three URL spaces coexist as-is
`/dashboard` (merchant), `/superadmin`, and `/sites/[shop]` (storefronts) are all **untouched**.
The marketplace is a **new top-level section**.

### New routes (under `app/`)
```
app/marketplace/            <- NEW section
  page.tsx                  /marketplace       home: popular shops + product search + "new" shops
  shops/page.tsx            /marketplace/shops all published shops
  search/page.tsx           /marketplace/search cross-shop product results
```
**Shop and product *detail* are NOT re-implemented.** A marketplace card deep-links into the
**existing storefront** (`/?_shop=<subdomain>` → the shop's home, or the product page within it).
This is what keeps the MVP small — cart, checkout, product detail, order tracking already work
per-shop.

### The entry-point chooser
Today `/` is a bare merchant-oriented landing page. The vision's "open a store vs shop the
marketplace" splash becomes the **new `/`** (or a `/welcome`): two clear paths → `/register`
(existing merchant flow) and `/marketplace` (new).

### ⚠️ The middleware coexistence problem (most important web issue)
`middleware.ts` rewrites **every** path to `/sites/{shop}` when a subdomain **or a sticky
`_dev_shop` cookie** is present. It has an explicit skip-list for `/dashboard`, `/login`,
`/superadmin`, etc. **`/marketplace` is not in that list.** Consequences if unaddressed:
- A visitor who previously opened any storefront gets a `_dev_shop` cookie. Navigating to
  `/marketplace` would be rewritten to `/sites/{shop}/marketplace` → broken.
- Root `/` with the cookie set already rewrites to the shop, not the landing — so the new chooser
  at `/` won't show either.

**Required (small) change:** add `/marketplace` (and the chooser path) to the middleware skip-list,
and **decide precedence** between "sticky shop cookie" and "explicit marketplace navigation"
(recommendation: an explicit `/marketplace` visit should win and ideally clear/ignore the
`_dev_shop` cookie). This is a **surgical edit to one file**, but it's essential and easy to miss —
hence flagged.

### Mobile
The mobile Customer tab currently hardcodes `ACTIVE_SHOP`. A mobile marketplace = the
**shop-picker deferred in Sprint 2**. Natural follow-on but **out of scope for this web-first
MVP**; the new `/marketplace/shops` API is exactly what it'll consume later.

---

## 5. MVP scope — the smallest coherent marketplace

### Build (v1)
1. **API:** additive index migration + `GET /marketplace/shops` (popular/newest) +
   `GET /marketplace/products` (cross-shop search).
2. **Web browse:** `/marketplace` home (popular shops + product search + new shops) and
   `/marketplace/shops`. Cards **deep-link into existing storefronts**.
3. **Entry chooser** at `/`: "Open a store" → register; "Shop the marketplace" → `/marketplace`.
4. **Middleware** skip-list + cookie precedence fix.

### Defer (explicitly out of v1)
- **Unified multi-shop cart & marketplace checkout.** Checkout is inherently per-shop
  (`/orders/guest` takes one `subdomain`, all items must belong to one shop). Each storefront
  already handles its own cart/checkout — reuse it. A cross-shop cart that splits into N orders is
  a whole project; defer.
- **Global category taxonomy / cross-shop category browse** (no canonical taxonomy exists).
- **Personalized suggestions** (v1 = popular).
- **Admin-curated "featured" shops** (additive `featuredAt` later).
- **Reviews / ratings / favorites** (no data).
- **`shop_stats` materialized cache** (compute live first).
- **Full-text search infra** (`pg_trgm`/tsvector) — start with `ILIKE` on name/description/tags;
  upgrade if slow.
- **Mobile marketplace / shop-picker.**

---

## Recommended build order (small sprints)

- **Sprint M1 — Marketplace API foundation** (backend only, verifiable with curl)
  - Additive migration: `Shop [status, publishedAt]`, `Product [status, createdAt]`.
  - `GET /marketplace/shops` (newest + popularity aggregation from orders/page views).
  - `GET /marketplace/products` (cross-shop search, with mandatory `shop.status='published'` filter
    and subdomain in payload).
  - *Risk touchpoint: the production DB migration — additive index only.*

- **Sprint M2 — Web marketplace browse**
  - `/marketplace` home + `/marketplace/shops`; shop/product cards deep-link into existing
    storefronts.
  - **Middleware skip-list + cookie precedence fix** (do this first in the sprint — nothing else
    works without it).

- **Sprint M3 — Entry point**
  - Chooser splash at `/`; wire both paths; light polish.

- **Later (M4+):** curated featured flag → categories → unified cart/checkout → mobile marketplace
  → search infra.

---

## Risks to the existing production system

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Middleware sticky-rewrite** breaks `/marketplace` (and the new `/` chooser) for anyone with a `_dev_shop` cookie or on a shop subdomain | **High** | Add `/marketplace` to skip-list; define cookie-vs-marketplace precedence. Test with a cookie set. |
| 2 | **Prisma migrate on prod DB** (Render pre-deploy hook) briefly locks on `CREATE INDEX` | Medium | Additive-only; tables tiny today. For scale, hand-write `CREATE INDEX CONCURRENTLY`. |
| 3 | **Cross-shop product query leaking** unpublished/suspended shops' products if `shop.status` filter omitted | Medium | Enforce `shop.status='published' AND product.status='active'` in the query; add a test. |
| 4 | **Per-shop slug uniqueness** — linking by slug alone would hit the wrong shop's product | Medium | Marketplace links always carry subdomain + slug. |
| 5 | Live ranking aggregation slows with many shops | Low | Fine at current scale; materialize later. |
| 6 | Assuming cross-shop categories exist | Low | Don't promise them in v1. |

**Nothing in this plan modifies existing tables' columns, existing endpoints, or the
merchant/storefront/superadmin apps.** Every change is additive: new indexes, a new API namespace,
new web routes, and one surgical middleware edit.
