'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { storefrontProductUrl } from '@/lib/storefront-url';
import { useCompare } from '@/lib/compare-context';
import MarketplaceHeader from '../_components/MarketplaceHeader';
import { fetchComparison, formatTk, type ComparePayload } from '../_components/api';
import {
  compareMode,
  discountOf,
  displaySpec,
  groupRows,
  rowVaries,
  NONE,
} from '../_components/compare-format';

// Side-by-side comparison (Sprint C5). Reads the ids the C4 tray holds, resolves
// them through GET /v1/marketplace/compare, and renders the table.
//
// Three render modes, all driven by `sharedCategoryId` so this file never
// re-derives the alignment rule the server already applied:
//
//   aligned       — one shared category: flat spec rows
//   mixed         — several categories, or some products uncategorised: an
//                   honest banner plus rows grouped under category subheadings
//   uncategorised — nothing categorised: common rows only, and a note saying so
//
// Degrade, never block: a sparse table beats refusing to compare.

export default function ComparePage() {
  const { items, ready, remove, clear, keepOnly } = useCompare();

  const [data, setData] = useState<ComparePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [diffOnly, setDiffOnly] = useState(false);

  // Keyed on the joined ids rather than the array, which is a fresh reference
  // every render.
  const idKey = items.map(i => i.id).join(',');

  useEffect(() => {
    if (!ready) return;

    if (items.length === 0) {
      setData(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    fetchComparison(
      idKey.split(','),
      controller.signal,
    ).then(result => {
      if (controller.signal.aborted) return;
      setLoading(false);

      // A null result is a transport failure, not an empty catalogue — leave the
      // tray alone so a network blip can't silently discard a selection.
      if (!result) {
        setFailed(true);
        return;
      }

      setFailed(false);
      setData(result);

      // Prune anything the server could not serve. This re-runs the effect once
      // with the corrected ids, which then reports no drops and settles.
      if (result.droppedIds.length > 0) {
        keepOnly(result.products.map(p => p.id));
      }
    });

    return () => controller.abort();
  }, [ready, idKey, items.length, keepOnly]);

  const products = data?.products ?? [];
  const mode = compareMode(
    products.length,
    data?.categories.length ?? 0,
    data?.sharedCategoryId ?? null,
  );

  const specRows = data?.specRows ?? [];
  const visibleRows = diffOnly ? specRows.filter(r => rowVaries(products, r)) : specRows;
  const hiddenCount = specRows.length - visibleRows.length;

  const groupedRows = groupRows(visibleRows);

  const categoryName = (id: string | null) =>
    data?.categories.find(c => c.id === id)?.name ?? 'Other';

  return (
    <div className="mk-root">
      <MarketplaceHeader />

      <div className="mk-browse">
        <div className="mk-browse-head">
          <div>
            <h1 className="mk-browse-title">Compare</h1>
            <p className="mk-browse-sub">
              {!ready || loading
                ? ' '
                : products.length > 0
                  ? `${products.length} product${products.length === 1 ? '' : 's'}`
                  : 'Nothing selected yet'}
            </p>
          </div>
          <div className="cmp-head-actions">
            {specRows.length > 0 && (
              <label className="cmp-diff-toggle">
                <input
                  type="checkbox"
                  checked={diffOnly}
                  onChange={e => setDiffOnly(e.target.checked)}
                />
                Show differences only
              </label>
            )}
            {products.length > 0 && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={clear}>
                Clear all
              </button>
            )}
          </div>
        </div>

        {failed && (
          <div className="alert alert-error">
            Could not load the comparison. Your selection is safe — try again.
          </div>
        )}

        {!ready || loading ? (
          <p className="mk-section-empty">Loading…</p>
        ) : products.length === 0 ? (
          <p className="mk-section-empty">
            Pick products from the{' '}
            <Link href="/marketplace/products" className="mk-section-link">
              marketplace
            </Link>{' '}
            using the Compare button on each card.
          </p>
        ) : (
          <>
            {mode === 'mixed' && (
              <p className="cmp-banner">
                These products are in different categories, so only price and general details can be
                compared directly.
              </p>
            )}
            {mode === 'uncategorised' && (
              <p className="cmp-banner">
                These products haven&apos;t been categorised for comparison yet, so only price and
                general details are shown.
              </p>
            )}

            <div className="cmp-table-wrap">
              <table className="cmp-table">
                <thead>
                  <tr>
                    <th className="cmp-col-label" />
                    {products.map(p => (
                      <th key={p.id} className="cmp-col-product">
                        <button
                          type="button"
                          className="cmp-col-remove"
                          onClick={() => remove(p.id)}
                          aria-label={`Remove ${p.name} from comparison`}
                          title="Remove"
                        >
                          ×
                        </button>
                        {p.image ? (
                          <img src={p.image} alt="" className="cmp-col-img" loading="lazy" />
                        ) : (
                          <span className="cmp-col-img cmp-col-img--empty" aria-hidden="true" />
                        )}
                        <span className="cmp-col-name">{p.name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {/* Always shown — universally meaningful, whatever the categories */}
                  <tr>
                    <th scope="row">Price</th>
                    {products.map(p => (
                      <td key={p.id} className="cmp-price">{formatTk(p.basePrice)}</td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">Discount</th>
                    {products.map(p => <td key={p.id}>{discountOf(p)}</td>)}
                  </tr>
                  <tr>
                    <th scope="row">Shop</th>
                    {products.map(p => <td key={p.id}>{p.shop.name}</td>)}
                  </tr>
                  <tr>
                    <th scope="row">Category</th>
                    {products.map(p => <td key={p.id}>{p.category?.name ?? NONE}</td>)}
                  </tr>

                  {groupedRows.map(group => (
                    <Fragment key={group.categoryId ?? 'none'}>
                      {mode === 'mixed' && (
                        <tr className="cmp-group-row">
                          <th scope="row" colSpan={products.length + 1}>
                            {categoryName(group.categoryId)}
                          </th>
                        </tr>
                      )}
                      {group.rows.map(row => (
                        <tr key={row.specFieldId}>
                          <th scope="row">{row.label}</th>
                          {products.map(p => (
                            <td key={p.id}>{displaySpec(p, row)}</td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>

                <tfoot>
                  <tr>
                    <th scope="row" />
                    {products.map(p => (
                      <td key={p.id}>
                        <a
                          href={storefrontProductUrl(p.shop.subdomain, p.slug)}
                          className="btn btn-secondary btn-sm"
                        >
                          View product
                        </a>
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>

            {diffOnly && hiddenCount > 0 && (
              <p className="cmp-hidden-note">
                {hiddenCount} identical row{hiddenCount === 1 ? '' : 's'} hidden.
              </p>
            )}
            {diffOnly && specRows.length > 0 && visibleRows.length === 0 && (
              <p className="cmp-hidden-note">
                These products match on every specification.
              </p>
            )}
            {mode !== 'uncategorised' && specRows.length === 0 && (
              <p className="cmp-hidden-note">
                No comparable specifications have been defined for these categories yet.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
