'use client';

import { useCompare } from '@/lib/compare-context';

// Compare toggle for the storefront product page (Sprint C6).
//
// The marketplace has its own toggle — a pill floating over a card image. This
// one sits in the product's actions row as an ordinary button, because that is
// what the storefront layout calls for.
//
// The selection itself needs no wiring here: CompareProvider is mounted at the
// app root, so it is already in scope under /sites/[shop]. The tray is rendered
// by the storefront layout, deliberately in the platform's own neutral styling
// rather than the merchant's theme — it is a marketplace affordance that
// happens to be reachable from inside a shop.

export interface StorefrontCompareProduct {
  id: string;
  name: string;
  slug: string;
  basePrice: string;
  compareAtPrice: string | null;
  image: string | null;
  shopName: string;
  subdomain: string;
}

export default function CompareToggleInline({ product }: { product: StorefrontCompareProduct }) {
  const { isSelected, isFull, limit, toggle } = useCompare();

  const selected = isSelected(product.id);
  const blocked = !selected && isFull;

  return (
    <button
      type="button"
      className={`cmp-inline-toggle${selected ? ' is-on' : ''}`}
      disabled={blocked}
      aria-pressed={selected}
      title={
        blocked
          ? `You can compare up to ${limit} products. Remove one to add another.`
          : undefined
      }
      onClick={() =>
        toggle({
          id: product.id,
          name: product.name,
          slug: product.slug,
          basePrice: product.basePrice,
          compareAtPrice: product.compareAtPrice,
          image: product.image,
          shop: { name: product.shopName, subdomain: product.subdomain },
        })
      }
    >
      <span aria-hidden="true">{selected ? '✓' : '+'}</span>
      {selected ? 'In comparison' : 'Compare'}
    </button>
  );
}
