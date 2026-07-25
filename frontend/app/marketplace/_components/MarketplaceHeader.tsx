import Link from 'next/link';

// Sticky marketplace top bar. Deliberately spare — brand on the left, one nav
// link to the full product browse — mirroring the storefront header's glassy,
// minimal treatment so the two surfaces feel like one product.
export default function MarketplaceHeader({ active }: { active?: 'home' | 'products' }) {
  return (
    <header className="mk-header">
      <div className="sf-container mk-header-inner">
        <Link href="/marketplace" className="mk-brand">
          <span className="mk-brand-mark" aria-hidden="true">B</span>
          <span className="mk-brand-name">BazarHQ<span className="mk-brand-sub"> Marketplace</span></span>
        </Link>
        <nav className="mk-nav">
          <Link href="/marketplace" className={`mk-nav-link${active === 'home' ? ' active' : ''}`}>
            Discover
          </Link>
          <Link href="/marketplace/products" className={`mk-nav-link${active === 'products' ? ' active' : ''}`}>
            All products
          </Link>
        </nav>
      </div>
    </header>
  );
}
