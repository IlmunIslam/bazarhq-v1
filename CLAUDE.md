# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BazarHQ is a **multi-tenant SaaS e-commerce platform** for Bangladesh. Merchants get a subdomain (`{shop}.bazarhq.com`) with a full storefront + admin dashboard. Architecture is documented in `../BazarHQ SDD.docx`, `../BazarHQ Implementation Plan.docx`, and `../BazarHQ ERD.docx`.

## Monorepo Structure

```
bazarhq-v1/
├── frontend/     # Next.js 14 (App Router) — storefront + merchant dashboard + superadmin
├── api/          # Node.js + Express — REST API at api.bazarhq.com/v1
└── shared/       # TypeScript types shared between frontend and api
```

## Development Commands

### API (`api/`)
```bash
cd api
npm install
npx prisma migrate dev --name <description>   # create + apply migration
npx prisma db push                             # sync schema without migration file (dev only)
npx prisma generate                            # regenerate Prisma client after schema changes
npm run dev                                    # start Express dev server
```

### Frontend (`frontend/`)
```bash
cd frontend
npm install
npm run dev      # Next.js dev server
npm run build    # production build
npm run lint     # ESLint
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 14 (App Router), TypeScript, React Hook Form + Zod |
| Backend | Node.js + Express, TypeScript |
| Database | PostgreSQL via Supabase, Prisma ORM |
| Auth | Supabase Auth (Google OAuth), custom JWT (httpOnly cookies, HS256) |
| Image CDN | Cloudinary |
| Email | Resend.com |
| SMS | SSL Wireless (Bangladesh) |
| Cache / Rate limit | Upstash Redis |
| Frontend hosting | Vercel (auto-deploy on push to main, root: `/frontend`) |
| API hosting | Render (auto-deploy on push, root: `/api`) — Prisma migrations run as pre-deploy hook |

## Live Deployment URLs

These are the **real** URLs for the deployed app — always use these for testing/screenshots:

| Service | URL |
|---------|-----|
| Frontend (Vercel) | `https://bazarhq-v1-frontend.vercel.app` |
| API (Render) | `https://bazarhq-api.onrender.com` |
| Superadmin panel | `https://bazarhq-v1-frontend.vercel.app/superadmin/login` |

> **Note:** `bazarhq.com` is a **placeholder domain we do not own** — ignore it entirely. It currently serves an unrelated marketing template (orangebd.com). The custom-domain mapping described elsewhere in this doc (`{shop}.bazarhq.com`, `api.bazarhq.com`) is aspirational, not live.

## Architecture: Four URL Spaces

All served by Next.js via wildcard DNS (`*.bazarhq.com` → Cloudflare):

1. `bazarhq.com` — Landing page, merchant sign-up (public)
2. `{shop}.bazarhq.com` — Customer storefront (public + optional customer auth)
3. `{shop}.bazarhq.com/admin` — Merchant dashboard (merchant JWT required)
4. `bazarhq.com/superadmin` — Super admin panel (IP-whitelisted + TOTP 2FA)

Next.js route groups: `(auth)/`, `dashboard/`, `[shop]/`, `superadmin/`

## Multi-Tenancy Pattern

- **Every merchant-scoped table has a `shop_id` foreign key** — always filter by it.
- One shop per user (enforced by `UNIQUE` constraint on `shops.user_id`).
- Isolation is dual-layer: application-level `shop_id` filtering + PostgreSQL Row Level Security (RLS).
- Subdomain = shop identifier for storefront routing.

## Authentication & JWT

- **Merchant JWT**: 7-day expiry, httpOnly cookie, SameSite=Strict
- **Customer JWT**: 30-day expiry
- **Admin JWT**: 8-hour absolute + 30-minute inactivity timeout
- `jti` (JWT ID) tracked in `sessions` table for targeted revocation
- Brute-force lockout backed by Upstash Redis (merchants: 5 failures → 30-min lock; admins: 3 failures)
- bcrypt cost factor 12 for password hashing

## API Conventions

- **Base URL**: `https://api.bazarhq.com/v1`
- **Response envelope**: `{ "success": true, "data": {...} }` or `{ "success": false, "error": { "code": "SNAKE_CASE_CODE", "message": "Human readable" } }`
- **Pagination**: cursor-based — `?cursor=<last_id>&limit=50` (max 100)
- **Money**: always returned as strings (e.g., `"1500.00"`) to avoid float errors
- **Validation**: Zod schemas in Express middleware (server) + React Hook Form + Zod (client)
- **No stack traces** in production error responses
- Rate limits: 100 req/min/IP (public), 300 req/min/user (authenticated)

## Database Patterns

- **Soft deletes for products**: set `status='archived'` if the product has order history; hard delete otherwise
- **Order snapshots**: `order_items` preserves `product_name`, `variant_name`, `unit_price` at time of purchase
- **Audit log**: `audit_logs` table is INSERT-only — enforced by PostgreSQL trigger; never UPDATE or DELETE from it
- **Sensitive fields** (bkash_number, nagad_number, ssl credentials, 2FA secrets) are encrypted with AES-256-GCM; API responses mask all but last 4 characters

## Database Schema — 18 Tables (5 Domains)

| Domain | Tables |
|--------|--------|
| Identity & Auth | users, admin_accounts, sessions, email_verifications |
| Shop & Tenancy | shops, shop_themes, shop_categories |
| Catalogue | products, product_images, product_variants |
| Commerce | orders, order_items, order_timeline, payment_configs |
| Platform | announcements, audit_logs, page_views, saved_addresses, customer_sms_preferences |

## Payment Methods

- **COD** — full support
- **bKash / Nagad** — manual verification (customer submits Transaction ID, merchant confirms)
- **SSLCommerz** — redirect flow (card data never touches BazarHQ servers)
- A shop must have ≥1 payment method enabled before it can publish (`POST /shops/me/publish`)

## Notification Patterns

- Email (Resend) + SMS (SSL Wireless) for order lifecycle events
- SMS failure auto-falls back to email
- Retry: 3 attempts with exponential backoff (1s → 5s → 15s)
- Always check `customer_sms_preferences` before sending SMS

## Development Approach

Build **vertically** — each sprint delivers a complete feature (DB migration + API routes + frontend UI) end-to-end. A sprint is only done when the UI shows the correct result. Work task-by-task with Claude Code, never a full sprint at once.

## Environment Variables

Each sub-project needs its own `.env` file. Required accounts: Supabase, Vercel, Railway, Cloudinary, Resend, Upstash Redis, Cloudflare, SSL Wireless.
