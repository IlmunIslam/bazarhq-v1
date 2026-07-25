// Which shop's storefront the customer app shows.
//
// The web storefront derives the shop from the subdomain ({shop}.bazarhq.com);
// the mobile app has no URL, so we target a single shop explicitly. For now this
// is the same published shop used by the Sprint 0 API proof.
//
// Override with EXPO_PUBLIC_SHOP_SUBDOMAIN if you want to point a build at a
// different shop. The eventual path is a shop-picker screen (or deep link) that
// sets the active shop at runtime — nothing else in the customer code assumes a
// hardcoded value, it all reads ACTIVE_SHOP. The cart is namespaced by this
// subdomain (see lib/cart), so switching shops keeps each shop's cart separate.
export const ACTIVE_SHOP = process.env.EXPO_PUBLIC_SHOP_SUBDOMAIN ?? 'alvi-s-store';
