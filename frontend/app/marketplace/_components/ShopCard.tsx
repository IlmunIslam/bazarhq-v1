import { storefrontUrl } from '@/lib/storefront-url';
import type { MarketplaceShop } from './api';

// A shop tile for the marketplace shops row. Links to the shop's storefront home
// via the shared ?_shop= helper (the same URL the dashboard's "View storefront"
// button uses), so it lands on the exact public storefront customers already use.
export default function ShopCard({ shop }: { shop: MarketplaceShop }) {
  return (
    <a href={storefrontUrl(shop.subdomain)} className="mk-shop-card">
      <div className="mk-shop-logo-wrap">
        {shop.logoUrl ? (
          <img src={shop.logoUrl} alt="" className="mk-shop-logo" loading="lazy" />
        ) : (
          <span className="mk-shop-logo-fallback" aria-hidden="true">
            {shop.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <p className="mk-shop-name">{shop.name}</p>
      <p className="mk-shop-meta">
        {shop.productCount} {shop.productCount === 1 ? 'product' : 'products'}
      </p>
    </a>
  );
}
