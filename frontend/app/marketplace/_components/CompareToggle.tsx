'use client';

import { useCompare } from '@/lib/compare-context';
import type { MarketplaceProduct } from './api';

// The Compare control that sits on a marketplace product card.
//
// The card is a single <a>, so this button has to stop the click twice over:
// preventDefault kills the anchor's navigation, stopPropagation keeps the event
// out of any handler on the card itself. Without both, ticking Compare would
// navigate away from the grid the customer is building a shortlist from.
export default function CompareToggle({ product }: { product: MarketplaceProduct }) {
  const { isSelected, isFull, limit, toggle } = useCompare();

  const selected = isSelected(product.id);
  const blocked = !selected && isFull;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (blocked) return;
    toggle({
      id: product.id,
      name: product.name,
      slug: product.slug,
      basePrice: product.basePrice,
      compareAtPrice: product.compareAtPrice,
      image: product.image,
      shop: { name: product.shop.name, subdomain: product.shop.subdomain },
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={selected}
      // Genuinely disabled, not just aria-disabled: it was still taking keyboard
      // focus and firing a click the handler silently swallowed. The tray
      // explains the cap, so nothing is lost by taking it out of the tab order.
      disabled={blocked}
      title={
        blocked
          ? `You can compare up to ${limit} products. Remove one to add another.`
          : selected
            ? 'Remove from comparison'
            : 'Add to comparison'
      }
      aria-label={
        selected ? `Remove ${product.name} from comparison` : `Add ${product.name} to comparison`
      }
      className={`cmp-toggle${selected ? ' is-on' : ''}${blocked ? ' is-blocked' : ''}`}
    >
      <span className="cmp-toggle-box" aria-hidden="true">
        {selected ? '✓' : '+'}
      </span>
      <span className="cmp-toggle-text">Compare</span>
    </button>
  );
}
