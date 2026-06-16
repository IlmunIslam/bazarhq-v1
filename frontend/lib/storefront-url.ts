/**
 * Builds the public storefront URL for a shop.
 *
 * Per-subdomain hosts ({shop}.bazarhq.com) aren't wired up in production, so the
 * storefront is reached on the main app origin with the shop selected via the
 * `?_shop=` query param.
 *
 * The base is taken from `window.location.origin` so the link always points at
 * the current deployment's domain — no build-time env var required. (NEXT_PUBLIC_*
 * vars are inlined at build time, so a value set in Vercel after the last build
 * wouldn't take effect.) During SSR `window` is undefined, so we fall back to
 * NEXT_PUBLIC_APP_URL (then localhost) to keep the server-rendered href stable.
 */
export function storefrontUrl(subdomain: string): string {
  const base =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${base}/?_shop=${subdomain}`;
}
