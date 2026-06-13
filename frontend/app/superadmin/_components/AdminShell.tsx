'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAdminAuth } from '@/lib/admin-auth-context';
import { api } from '@/lib/api-client';

const NAV = [
  { href: '/superadmin', label: 'Overview', exact: true },
  { href: '/superadmin/merchants', label: 'Merchants' },
  { href: '/superadmin/analytics', label: 'Analytics' },
  { href: '/superadmin/content', label: 'Announcements' },
  { href: '/superadmin/audit-logs', label: 'Audit Logs' },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { admin } = useAdminAuth();
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await api.post('/admin/auth/logout', {});
    router.replace('/superadmin/login');
  };

  return (
    <div className="sa-root">
      <header className="sa-header">
        <div className="sa-header-left">
          <span className="sa-brand">BazarHQ</span>
          <span className="sa-badge">Super Admin</span>
        </div>
        <div className="sa-header-right">
          {admin && <span className="sa-admin-name">{admin.fullName}</span>}
          <button onClick={handleLogout} className="btn-logout">Log out</button>
        </div>
      </header>

      <div className="sa-body">
        <aside className="sa-sidebar">
          <nav>
            {NAV.map(({ href, label, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`sa-nav-link${active ? ' active' : ''}`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="sa-main">
          {children}
        </main>
      </div>
    </div>
  );
}
