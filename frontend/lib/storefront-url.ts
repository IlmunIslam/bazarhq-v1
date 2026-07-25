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

/**
 * Builds the public URL for a single product inside a shop's storefront.
 *
 * Same `?_shop=` selection mechanism as {@link storefrontUrl}: the middleware
 * rewrites `/products/{slug}?_shop={subdomain}` → `/sites/{subdomain}/products/{slug}`
 * and sets the `_dev_shop` cookie so onward navigation stays in that storefront.
 * Used by the marketplace to deep-link a cross-shop product card into the shop
 * that actually sells it (slugs are unique only per shop, hence the subdomain).
 */
export function storefrontProductUrl(subdomain: string, slug: string): string {
  const base =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${base}/products/${slug}?_shop=${subdomain}`;
}
