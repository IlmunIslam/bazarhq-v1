'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';

const STATUS_OPTIONS = ['', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
const STATUS_LABELS: Record<string, string> = {
  '': 'All',
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  processing: '#8b5cf6',
  shipped: '#06b6d4',
  delivered: '#10b981',
  cancelled: '#ef4444',
};

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  total: number;
  customerName: string;
  customerPhone: string;
  createdAt: string;
  _count: { items: number };
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchOrders = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (search) params.set('search', search);
    if (cursor) params.set('cursor', cursor);
    params.set('limit', '20');

    const res = await api.get<{ orders: Order[]; nextCursor: string | null }>(`/orders?${params}`);
    if (!res.success) return { orders: [], nextCursor: null };
    return res.data;
  }, [statusFilter, search]);

  useEffect(() => {
    setLoading(true);
    fetchOrders().then(data => {
      setOrders(data.orders);
      setNextCursor(data.nextCursor);
    }).finally(() => setLoading(false));
  }, [fetchOrders]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    const data = await fetchOrders(nextCursor);
    setOrders(o => [...o, ...data.orders]);
    setNextCursor(data.nextCursor);
    setLoadingMore(false);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  const PAYMENT_LABELS: Record<string, string> = { cod: 'COD', bkash: 'bKash', nagad: 'Nagad' };

  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <h1 className="dashboard-page-title">Orders</h1>
      </div>

      {/* Filters */}
      <div className="orders-filters">
        <div className="orders-status-tabs">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              className={`orders-status-tab ${statusFilter === s ? 'active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <form onSubmit={handleSearch} className="orders-search-form">
          <input
            type="text"
            className="orders-search-input"
            placeholder="Search by order #, name, phone…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          <button type="submit" className="orders-search-btn">Search</button>
        </form>
      </div>

      {loading ? (
        <div className="dashboard-loading">Loading orders…</div>
      ) : orders.length === 0 ? (
        <div className="dashboard-empty">
          <p>No orders found.</p>
        </div>
      ) : (
        <div className="orders-table-wrapper">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Payment</th>
                <th>Total</th>
                <th>Status</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id}>
                  <td className="orders-number">#{order.orderNumber}</td>
                  <td>
                    <div>{order.customerName}</div>
                    <div className="orders-phone">{order.customerPhone}</div>
                  </td>
                  <td>{order._count.items}</td>
                  <td>
                    <span>{PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}</span>
                    <span className={`orders-payment-status ${order.paymentStatus}`}>
                      {order.paymentStatus}
                    </span>
                  </td>
                  <td>৳{Number(order.total).toLocaleString()}</td>
                  <td>
                    <span
                      className="orders-status-badge"
                      style={{ background: STATUS_COLORS[order.status] + '20', color: STATUS_COLORS[order.status] }}
                    >
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </td>
                  <td className="orders-date">
                    {new Date(order.createdAt).toLocaleDateString('en-BD', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </td>
                  <td>
                    <Link href={`/dashboard/orders/${order.id}`} className="orders-view-btn">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {nextCursor && (
            <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
              <button className="btn-secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
