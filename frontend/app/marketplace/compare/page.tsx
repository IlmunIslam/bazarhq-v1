'use client';

import Link from 'next/link';
import { storefrontProductUrl } from '@/lib/storefront-url';
import { useCompare } from '@/lib/compare-context';
import MarketplaceHeader from '../_components/MarketplaceHeader';
import { formatTk } from '../_components/api';

// Sprint C4 ships this as a real destination rather than leaving the tray's
// Compare button pointing at a 404. It shows what the customer selected and is
// honest that the side-by-side table is not built yet.
//
// C5 replaces the body below with the real comparison: it fetches
// GET /v1/marketplace/compare?ids=… , which resolves each product's category and
// spec values server-side, drops any that are no longer visible, and returns the
// merged spec rows. The route, the header and the empty state stay as they are.
export default function ComparePage() {
  const { items, ready, remove, clear } = useCompare();

  return (
    <div className="mk-root">
      <MarketplaceHeader />

      <div className="mk-browse">
        <div className="mk-browse-head">
          <div>
            <h1 className="mk-browse-title">Compare</h1>
            {/* Stays quiet until storage has been read, so the subtitle never
                claims "nothing selected" over a body that is still loading. */}
            <p className="mk-browse-sub">
              {!ready
                ? ' '
                : items.length > 0
                  ? `${items.length} product${items.length === 1 ? '' : 's'} selected`
                  : 'Nothing selected yet'}
            </p>
          </div>
          {items.length > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={clear}>
              Clear all
            </button>
          )}
        </div>

        {!ready ? (
          <p className="mk-section-empty">Loading…</p>
        ) : items.length === 0 ? (
          <p className="mk-section-empty">
            Pick products from the{' '}
            <Link href="/marketplace/products" className="mk-section-link">
              marketplace
            </Link>{' '}
            using the Compare button on each card.
          </p>
        ) : (
          <>
            <p className="cmp-page-note">
              Side-by-side specification comparison is coming next. For now, here is your
              shortlist.
            </p>

            <ul className="cmp-list">
              {items.map(item => (
                <li key={item.id} className="cmp-list-item">
                  {item.image ? (
                    <img src={item.image} alt="" className="cmp-list-thumb" loading="lazy" />
                  ) : (
                    <span className="cmp-list-thumb cmp-list-thumb--empty" aria-hidden="true" />
                  )}
                  <div className="cmp-list-body">
                    <p className="cmp-list-name">{item.name}</p>
                    <p className="cmp-list-shop">{item.shop.name}</p>
                    <p className="cmp-list-price">{formatTk(item.basePrice)}</p>
                  </div>
                  <div className="cmp-list-actions">
                    <a
                      href={storefrontProductUrl(item.shop.subdomain, item.slug)}
                      className="btn btn-secondary btn-sm"
                    >
                      View product
                    </a>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => remove(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
