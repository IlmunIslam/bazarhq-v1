'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, shop, loading } = useAuth();
  const router = useRouter();

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
              href={`http://${shop.subdomain}.bazarhq.com`}
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
            <Link href="/dashboard" className="sidebar-link">Overview</Link>
            <Link href="/dashboard/products" className="sidebar-link">Products</Link>
            <Link href="/dashboard/orders" className="sidebar-link">Orders</Link>
            <Link href="/dashboard/settings" className="sidebar-link">Settings</Link>
          </nav>
        </aside>
      )}

      <main className={shop ? 'dashboard-main' : 'dashboard-main-setup'}>
        {children}
      </main>
    </div>
  );
}
