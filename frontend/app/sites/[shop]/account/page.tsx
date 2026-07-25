'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useShop } from '../_components/StorefrontShell';
import { shopHref } from '../_components/shop-href';

interface OrderItem {
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  total: number;
  createdAt: string;
  items: OrderItem[];
  shop: { name: string; subdomain: string };
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  processing: '#8b5cf6',
  shipped: '#06b6d4',
  delivered: '#10b981',
  cancelled: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

function fmt(n: number) {
  return Number(n).toLocaleString('en-BD');
}

export default function CustomerAccountPage() {
  const router = useRouter();
  const { subdomain } = useShop();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerName, setCustomerName] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<{ customer: { phone: string; name: string } }>('/customer/me'),
      api.get<{ orders: Order[] }>('/customer/orders'),
    ]).then(([meRes, ordersRes]) => {
      if (!meRes.success) {
        router.replace(shopHref('/account/login', subdomain));
        return;
      }
      setCustomerName(meRes.data.customer.name);
      if (ordersRes.success) setOrders(ordersRes.data.orders);
      setLoading(false);
    });
  }, [router, subdomain]);

  const handleLogout = async () => {
    await api.post('/customer/auth/logout', {});
    router.replace(shopHref('/account/login', subdomain));
  };

  if (loading) {
    return (
      <div className="sf-container" style={{ padding: '3rem 1rem', textAlign: 'center', color: '#6b7280' }}>
        Loading your orders…
      </div>
    );
  }

  return (
    <div className="sf-container" style={{ maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700 }}>My Orders</h1>
          {customerName && (
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.2rem' }}>Hello, {customerName}</p>
          )}
        </div>
        <button
          onClick={handleLogout}
          style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '0.4rem 0.875rem', fontSize: '0.8125rem', cursor: 'pointer', color: '#6b7280' }}
        >
          Sign out
        </button>
      </div>

      {orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6b7280' }}>
          <p>No orders yet.</p>
          <Link href={shopHref('/', subdomain)} style={{ display: 'inline-block', marginTop: '1rem', fontSize: '0.875rem', color: 'var(--sf-primary)' }}>
            Start shopping →
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {orders.map(order => (
            <div key={order.id} style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              padding: '1.25rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{order.orderNumber}</span>
                  <span style={{ fontSize: '0.8125rem', color: '#9ca3af', marginLeft: '0.5rem' }}>
                    {new Date(order.createdAt).toLocaleDateString('en-BD', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '0.2rem 0.6rem',
                  borderRadius: 999,
                  background: `${STATUS_COLORS[order.status]}1a`,
                  color: STATUS_COLORS[order.status],
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}>
                  {STATUS_LABELS[order.status] ?? order.status}
                </span>
              </div>

              <div style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.75rem' }}>
                {order.items.map((item, i) => (
                  <span key={i}>
                    {item.productName}{item.variantName ? ` (${item.variantName})` : ''} ×{item.quantity}
                    {i < order.items.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ fontWeight: 700, fontSize: '1rem' }}>৳{fmt(order.total)}</span>
                <Link
                  href={shopHref(`/track?orderNumber=${order.orderNumber}`, subdomain)}
                  style={{ fontSize: '0.8125rem', color: 'var(--sf-primary)', textDecoration: 'underline' }}
                >
                  Track order →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
