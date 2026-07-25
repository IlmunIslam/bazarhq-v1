// Builds a storefront-internal URL that carries the shop selection explicitly
// as `?_shop={subdomain}`.
//
// Storefronts are reached on the shared app origin (no per-shop subdomain in
// production), so every in-shop link must assert its shop. Middleware's
// `?_shop=` branch resolves the storefront on ANY path — including the bare
// root "/" — independently of the `_dev_shop` cookie. Carrying the shop in the
// link keeps navigation in-shop by design and no longer depends on cookie
// stickiness (which intentionally no longer applies to "/").
export function shopHref(path: string, subdomain: string): string {
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('_shop', subdomain);
  return `${pathname}?${params.toString()}`;
}
