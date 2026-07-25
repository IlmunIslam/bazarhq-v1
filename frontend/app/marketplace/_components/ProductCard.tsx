import { storefrontProductUrl } from '@/lib/storefront-url';
import { formatTk, type MarketplaceProduct } from './api';

// A single cross-shop product card. Reuses the storefront's `sf-product-card`
// visual system (so it matches the shops customers already browse) and adds a
// shop-attribution line — the one thing storefront cards don't need, because
// there every product belongs to the same shop.
export default function ProductCard({ product, index = 0 }: { product: MarketplaceProduct; index?: number }) {
  const price = Number(product.basePrice);
  const compare = product.compareAtPrice ? Number(product.compareAtPrice) : null;
  const discount = compare && compare > price ? Math.round((1 - price / compare) * 100) : null;

  return (
    <a
      href={storefrontProductUrl(product.shop.subdomain, product.slug)}
      className="sf-product-card mk-product-card"
      style={{ animationDelay: `${Math.min(index, 11) * 45}ms` }}
    >
      <div className="sf-product-img-wrap">
        {product.image ? (
          <img src={product.image} alt={product.name} className="sf-product-img" loading="lazy" />
        ) : (
          <div className="sf-product-img sf-no-img">No image</div>
        )}
        {discount !== null && (
          <div className="sf-badges">
            <span className="sf-badge sf-badge--sale">−{discount}%</span>
          </div>
        )}
      </div>
      <div className="sf-product-info">
        <p className="sf-product-name">{product.name}</p>
        <div className="sf-product-price-row">
          <span className="sf-product-price">{formatTk(product.basePrice)}</span>
          {compare && <span className="sf-product-was">{formatTk(product.compareAtPrice!)}</span>}
        </div>
        <div className="mk-product-shop">
          {product.shop.logoUrl ? (
            <img src={product.shop.logoUrl} alt="" className="mk-product-shop-logo" loading="lazy" />
          ) : (
            <span className="mk-product-shop-dot" aria-hidden="true" />
          )}
          <span className="mk-product-shop-name">{product.shop.name}</span>
        </div>
      </div>
    </a>
  );
}
