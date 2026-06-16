'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import { storefrontUrl } from '@/lib/storefront-url';

const ICONS: Record<string, React.ReactNode> = {
  overview: <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5Z" />,
  products: <><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></>,
  orders: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></>,
  analytics: <><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="m19 9-5 5-4-4-3 3" /></>,
  settings: <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" /><circle cx="12" cy="12" r="3" /></>,
  account: <><circle cx="12" cy="8" r="4" /><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /></>,
};

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: 'overview' },
  { href: '/dashboard/products', label: 'Products', icon: 'products' },
  { href: '/dashboard/orders', label: 'Orders', icon: 'orders' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: 'analytics' },
  { href: '/dashboard/settings', label: 'Settings', icon: 'settings' },
  { href: '/dashboard/account', label: 'Account', icon: 'account' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, shop, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="dashboard-loading">
        <span>Loading…</span>
      </div>
    );
  }

  if (!user) return null;

  const handleLogout = async () => {
    await api.post('/auth/logout', {});
    router.replace('/login');
  };

  return (
    <div className="dashboard-root">
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <span className="dashboard-brand">BazarHQ</span>
          {shop && (
            <span className="dashboard-shop-name">{shop.name}</span>
          )}
        </div>
        <nav className="dashboard-header-right">
          {shop && (
            <a
              href={storefrontUrl(shop.subdomain)}
              target="_blank"
              rel="noopener noreferrer"
              className="header-link"
            >
              View store ↗
            </a>
          )}
          <span className="header-user">{user.fullName}</span>
          <button onClick={handleLogout} className="btn-logout">
            Log out
          </button>
        </nav>
      </header>

      {shop && (
        <aside className="dashboard-sidebar">
          <nav>
            {NAV.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link${isActive(item.href) ? ' active' : ''}`}
                aria-current={isActive(item.href) ? 'page' : undefined}
              >
                <svg className="sidebar-link-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {ICONS[item.icon]}
                </svg>
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
      )}

      <main className={shop ? 'dashboard-main' : 'dashboard-main-setup'}>
        {children}
      </main>
    </div>
  );
}
