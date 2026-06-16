/**
 * Builds the public storefront URL for a shop.
 *
 * Per-subdomain hosts ({shop}.bazarhq.com) aren't wired up in production, so the
 * storefront is reached on the main app origin with the shop selected via the
 * `?_shop=` query param. In production NEXT_PUBLIC_APP_URL provides that origin
 * (e.g. the Vercel deployment); in development it falls back to localhost:3000.
 */
export function storefrontUrl(subdomain: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${base}/?_shop=${subdomain}`;
}
