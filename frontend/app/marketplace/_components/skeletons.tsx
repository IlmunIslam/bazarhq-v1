// Loading placeholders that reserve the exact layout of the real content, so the
// page paints instantly and swapping in data causes no layout shift (CLS ~0).
// Reuses the storefront shimmer (`sf-skeleton`).

export function ProductGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="sf-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="mk-card-skeleton">
          <div className="sf-skeleton mk-card-skeleton-img" />
          <div className="mk-card-skeleton-line" />
          <div className="mk-card-skeleton-line mk-card-skeleton-line--short" />
        </div>
      ))}
    </div>
  );
}

export function ShopRowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="mk-shop-row">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="mk-shop-card mk-shop-card--skeleton">
          <div className="sf-skeleton mk-shop-logo-skeleton" />
          <div className="mk-card-skeleton-line" />
        </div>
      ))}
    </div>
  );
}
