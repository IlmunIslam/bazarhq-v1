'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';

const STATUS_LABELS: Record<string, string> = {
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

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:    ['confirmed', 'cancelled'],
  confirmed:  ['processing', 'shipped', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped:    ['delivered'],
  delivered:  [],
  cancelled:  [],
};

const PAYMENT_LABELS: Record<string, string> = { cod: 'Cash on Delivery', bkash: 'bKash', nagad: 'Nagad' };

interface OrderItem {
  id: string;
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

interface TimelineEntry {
  id: string;
  status: string;
  note: string | null;
  createdAt: string;
  createdBy: string;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  transactionId: string | null;
  subtotal: number;
  shippingFee: number;
  total: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  shippingAddress: { line1: string; line2?: string; city: string; district: string };
  notes: string | null;
  createdAt: string;
  items: OrderItem[];
  timeline: TimelineEntry[];
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [statusNote, setStatusNote] = useState('');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ order: Order }>(`/orders/${id}`).then(res => {
      if (res.success) setOrder(res.data.order);
    }).catch(() => {
      setError('Failed to load order.');
    }).finally(() => setLoading(false));
  }, [id]);

  async function updateStatus() {
    if (!pendingStatus || !order) return;
    setUpdating(true);
    setError('');
    try {
      const res = await api.patch<{ order: Order }>(`/orders/${order.id}/status`, {
        status: pendingStatus,
        note: statusNote.trim() || undefined,
      });
      if (res.success) {
        setOrder(res.data.order);
        setShowStatusModal(false);
        setStatusNote('');
        setPendingStatus('');
      } else {
        setError(res.error?.message ?? 'Failed to update status.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setUpdating(false);
    }
  }

  if (loading) return <div className="dashboard-loading">Loading order…</div>;
  if (!order) return <div className="dashboard-empty"><p>{error || 'Order not found.'}</p></div>;

  const allowedTransitions = VALID_TRANSITIONS[order.status] ?? [];

  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn-ghost" onClick={() => router.push('/dashboard/orders')}>← Orders</button>
          <h1 className="dashboard-page-title">#{order.orderNumber}</h1>
          <span
            className="orders-status-badge"
            style={{ background: STATUS_COLORS[order.status] + '20', color: STATUS_COLORS[order.status] }}
          >
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
        </div>
        {allowedTransitions.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {allowedTransitions.map(s => (
              <button
                key={s}
                className={s === 'cancelled' ? 'btn-danger-outline' : 'btn-primary'}
                onClick={() => { setPendingStatus(s); setShowStatusModal(true); }}
              >
                {s === 'cancelled' ? 'Cancel Order' : `Mark ${STATUS_LABELS[s]}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="order-detail-grid">
        {/* Items */}
        <div className="order-detail-card order-detail-items">
          <h2 className="order-detail-card-title">Items</h2>
          <table className="orders-table">
            <thead>
              <tr>
                <th>Product</th>
                <th style={{ textAlign: 'right' }}>Unit Price</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map(item => (
                <tr key={item.id}>
                  <td>
                    {item.productName}
                    {item.variantName && <span className="orders-phone"> ({item.variantName})</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>৳{Number(item.unitPrice).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                  <td style={{ textAlign: 'right' }}>৳{Number(item.subtotal).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="order-totals">
            <div className="order-totals-row">
              <span>Subtotal</span><span>৳{Number(order.subtotal).toLocaleString()}</span>
            </div>
            <div className="order-totals-row">
              <span>Shipping</span><span>{Number(order.shippingFee) === 0 ? 'Free' : `৳${Number(order.shippingFee).toLocaleString()}`}</span>
            </div>
            <div className="order-totals-row order-totals-total">
              <strong>Total</strong><strong>৳{Number(order.total).toLocaleString()}</strong>
            </div>
          </div>
        </div>

        <div className="order-detail-sidebar">
          {/* Customer */}
          <div className="order-detail-card">
            <h2 className="order-detail-card-title">Customer</h2>
            <p><strong>{order.customerName}</strong></p>
            <p>{order.customerPhone}</p>
            {order.customerEmail && <p>{order.customerEmail}</p>}
          </div>

          {/* Delivery */}
          <div className="order-detail-card">
            <h2 className="order-detail-card-title">Delivery Address</h2>
            <p>{order.shippingAddress.line1}</p>
            {order.shippingAddress.line2 && <p>{order.shippingAddress.line2}</p>}
            <p>{order.shippingAddress.city}, {order.shippingAddress.district}</p>
          </div>

          {/* Payment */}
          <div className="order-detail-card">
            <h2 className="order-detail-card-title">Payment</h2>
            <p>{PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}</p>
            <p>
              Status:&nbsp;
              <span className={`orders-payment-status ${order.paymentStatus}`}>{order.paymentStatus}</span>
            </p>
            {order.transactionId && <p>TxID: <code>{order.transactionId}</code></p>}
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="order-detail-card">
              <h2 className="order-detail-card-title">Customer Notes</h2>
              <p>{order.notes}</p>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="order-detail-card order-detail-timeline">
          <h2 className="order-detail-card-title">Timeline</h2>
          <div className="sf-order-timeline">
            {order.timeline.map(entry => (
              <div key={entry.id} className="sf-timeline-entry">
                <div className="sf-timeline-dot" style={{ background: STATUS_COLORS[entry.status] }} />
                <div className="sf-timeline-content">
                  <span className="sf-timeline-status">{STATUS_LABELS[entry.status] ?? entry.status}</span>
                  {entry.note && <span className="sf-timeline-note"> — {entry.note}</span>}
                  <span className="sf-timeline-time">
                    {new Date(entry.createdAt).toLocaleString('en-BD', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status update modal */}
      {showStatusModal && (
        <div className="modal-overlay" onClick={() => setShowStatusModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">
              {pendingStatus === 'cancelled' ? 'Cancel Order?' : `Mark as ${STATUS_LABELS[pendingStatus]}`}
            </h2>
            <div className="form-group">
              <label className="form-label">Note (optional)</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder={pendingStatus === 'cancelled' ? 'Reason for cancellation…' : 'Add a note…'}
                value={statusNote}
                onChange={e => setStatusNote(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowStatusModal(false)}>Cancel</button>
              <button
                className={pendingStatus === 'cancelled' ? 'btn-danger' : 'btn-primary'}
                onClick={updateStatus}
                disabled={updating}
              >
                {updating ? 'Updating…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
