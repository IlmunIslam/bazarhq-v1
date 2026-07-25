import Link from 'next/link';

// BazarHQ front door. A static server component — no client JS, no API calls —
// so it paints instantly. Explains the two-sided marketplace and offers two
// equally-weighted paths: open a store (merchant) or shop the marketplace.
// All CTAs target first-party routes in the middleware skip-list (/register,
// /login, /marketplace), so they're never rewritten to a storefront.
export const metadata = {
  title: 'BazarHQ — Open a store. Shop every store.',
  description:
    "Bangladesh's multi-vendor marketplace. Launch your own online storefront in minutes, or browse and buy from local shops in one place.",
};

export default function LandingPage() {
  return (
    <div className="lp-root">
      <header className="lp-header">
        <div className="lp-container lp-header-inner">
          <span className="lp-brand">
            <span className="lp-brand-mark" aria-hidden="true">B</span>
            BazarHQ
          </span>
          <nav className="lp-header-nav">
            <Link href="/login" className="lp-header-link">Sign in</Link>
            <Link href="/register" className="lp-btn lp-btn-primary lp-btn-sm">Open a store</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="lp-hero">
          <div className="lp-container">
            <p className="lp-eyebrow">Bangladesh&apos;s multi-vendor marketplace</p>
            <h1 className="lp-hero-title">Open your store.<br />Shop every store.</h1>
            <p className="lp-hero-sub">
              BazarHQ lets anyone launch their own online storefront in minutes — and lets shoppers
              browse and buy from hundreds of local stores, all in one place.
            </p>
            <div className="lp-hero-ctas">
              <Link href="/register" className="lp-btn lp-btn-primary lp-btn-lg">Open a store</Link>
              <Link href="/marketplace" className="lp-btn lp-btn-secondary lp-btn-lg">Browse the marketplace</Link>
            </div>
          </div>
        </section>

        {/* Dual value props */}
        <section className="lp-container lp-dual">
          <div className="lp-card">
            <span className="lp-card-tag">For merchants</span>
            <h2 className="lp-card-title">Sell on BazarHQ</h2>
            <p className="lp-card-text">
              Your own storefront, live in minutes. Manage products, orders, and payments — Cash on
              Delivery, bKash, and Nagad — from one dashboard. No code, no upfront fees.
            </p>
            <Link href="/register" className="lp-card-link">Start selling →</Link>
          </div>

          <div className="lp-card">
            <span className="lp-card-tag">For shoppers</span>
            <h2 className="lp-card-title">Shop the marketplace</h2>
            <p className="lp-card-text">
              Discover products from local stores across Bangladesh in a single feed. Find what you
              want, then check out securely on the shop that sells it.
            </p>
            <Link href="/marketplace" className="lp-card-link">Start shopping →</Link>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <span className="lp-brand lp-brand-sm">
            <span className="lp-brand-mark" aria-hidden="true">B</span>
            BazarHQ
          </span>
          <p className="lp-footer-note">© {new Date().getFullYear()} BazarHQ · Commerce for Bangladesh</p>
        </div>
      </footer>
    </div>
  );
}
