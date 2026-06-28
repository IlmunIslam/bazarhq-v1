# BazarHQ Mobile (Android)

Native Android app for BazarHQ, built with **Expo SDK 56** (Expo Router, TypeScript).
Talks to the same production API as the web app (`https://bazarhq-api.onrender.com/v1`).

Status: **Sprint 0 — foundation only.** Navigation skeleton + API client + one
connectivity proof. No real screens, auth, or data yet.

## ⚠️ This is a standalone project, NOT an npm workspace

`mobile/` is deliberately **excluded** from the root `package.json` `workspaces`
array (`["shared", "frontend", "api"]`) and keeps its **own isolated
`node_modules`**.

**Why:** Expo SDK 56 requires **React 19**, but `frontend/` pins **React 18.3**.
Keeping mobile out of the workspace tree prevents npm hoisting from forcing a
React version that would break the working frontend.

**Consequences for contributors:**
- Install deps from **inside** `mobile/` — never from the repo root:
  ```bash
  cd mobile
  npm install            # or: npx expo install <pkg>
  ```
- Do **not** add `mobile` to the root `workspaces` array.

## Running it

```bash
cd mobile
npx expo start            # scan the QR in Expo Go (phone on same Wi-Fi)
# or, if phone and computer aren't on the same network:
npx expo start --tunnel
```

Use the latest **Expo Go** from the Play Store (needed for SDK 56). On a real
device the Customer tab shows `Connected — shop: Alvi's store`. On the **web**
target (`npx expo start --web`) the proof fails with a CORS "Failed to fetch"
because the API only whitelists the Vercel origin — that's expected, not a bug.

## Structure

```
mobile/
├── src/app/_layout.tsx   # bottom-tab navigator (stable expo-router Tabs)
├── src/app/index.tsx     # Customer — API connectivity proof
├── src/app/merchant.tsx  # placeholder
├── src/app/admin.tsx     # placeholder
└── src/lib/api-client.ts # API client, ported from frontend/lib/api-client.ts
```

Routes live under `src/app` (alias `@/*` → `./src/*`).

## Environment

Config comes from `EXPO_PUBLIC_API_URL` (see `.env.example`). Copy it to `.env`
to override; the client defaults to the production API otherwise.

> `EXPO_PUBLIC_*` values are embedded in the built app and readable by anyone who
> unpacks the APK. Put **only non-secret** values there — never JWTs or keys.

## Shared types

Shared types are consumed from `@bazarhq/shared` via a tsconfig path alias
(`@bazarhq/shared` → `../shared/src`) using `import type`. Because the imports
are type-only they're erased at build time, so there is **zero runtime/Metro
coupling** to the rest of the monorepo. If a *runtime* value from `shared/` is
ever needed, copy that one file or add a Metro watch folder — do not add mobile
to the workspaces.

## Sprint 1 dependencies (not built yet)

- **Auth:** `expo-secure-store` (Android Keystore) + `Authorization: Bearer <jwt>`.
  The web uses httpOnly cookies, which React Native can't use. This **requires a
  small API change** so merchant/customer/admin auth accepts a Bearer token in
  addition to the cookie. The `authHeader()` hook in `src/lib/api-client.ts` is
  the placeholder for this.
- Real Customer / Merchant / Admin screens and data.
