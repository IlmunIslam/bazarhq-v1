'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';

const STATUS_STEPS = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'] as const;

const STATUS_LABELS: Record<string, string> = {
  pending:    'Order Placed',
  confirmed:  'Confirmed',
  processing: 'Processing',
  shipped:    'Shipped',
  delivered:  'Delivered',
  cancelled:  'Cancelled',
};

const PAYMENT_LABELS: Record<string, string> = { cod: 'Cash on Delivery', bkash: 'bKash', nagad: 'Nagad' };

interface OrderItem {
  id: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface TimelineEntry {
  id: string;
  status: string;
  note: string | null;
  createdAt: string;
}

interface Order {
  orderNumber: string;
  status: string;
  paymentMethod: string;
  total: number;
  customerName: string;
  shippingAddress: { line1: string; city: string; district: string };
  createdAt: string;
  items: OrderItem[];
  timeline: TimelineEntry[];
}

function TrackPageInner() {
  const searchParams = useSearchParams();

  const [orderNumber, setOrderNumber] = useState(searchParams.get('orderNumber') ?? '');
  const [phone, setPhone] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  async function handleTrack(e: React.FormEvent) {
    e.preventDefault();
    if (!orderNumber.trim() || !phone.trim()) return;
    setLoading(true);
    setError('');
    setOrder(null);

    try {
      const res = await fetch(
        `${API}/orders/track?orderNumber=${encodeURIComponent(orderNumber.trim())}&phone=${encodeURIComponent(phone.trim())}`
      );
      const json = await res.json();
      if (json.success) {
        setOrder(json.data.order);
      } else {
        setError('Order not found. Please check your order number and phone number.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }

  const isCancelled = order?.status === 'cancelled';
  const currentStepIndex = order ? STATUS_STEPS.indexOf(order.status as typeof STATUS_STEPS[number]) : -1;

  return (
    <div className="sf-container sf-track">
      <h1 className="sf-track-title">Track Your Order</h1>

      <div className="sf-track-form-card">
        <p className="sf-track-subtitle">Enter your order number and phone number to see the latest status.</p>
        <form onSubmit={handleTrack} className="sf-track-form">
          <div className="sf-field">
            <label className="sf-field-label">Order Number</label>
            <input
              type="text"
              className="sf-field-input"
              placeholder="e.g. ORD-A1B2C3D4"
              value={orderNumber}
              onChange={e => setOrderNumber(e.target.value)}
              required
            />
          </div>
          <div className="sf-field">
            <label className="sf-field-label">Phone Number</label>
            <input
              type="tel"
              className="sf-field-input"
              placeholder="01XXXXXXXXX"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="sf-track-btn" disabled={loading}>
            {loading ? 'Searching…' : 'Track Order'}
          </button>
        </form>
      </div>

      {error && searched && (
        <div className="sf-track-error">
          <p>{error}</p>
        </div>
      )}

      {order && (
        <div className="sf-track-result">
          {/* Header */}
          <div className="sf-track-order-header">
            <div>
              <div className="sf-track-order-number">#{order.orderNumber}</div>
              <div className="sf-track-order-date">
                Placed on {new Date(order.createdAt).toLocaleDateString('en-BD', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
            <div className={`sf-track-status-badge ${isCancelled ? 'cancelled' : ''}`}>
              {STATUS_LABELS[order.status] ?? order.status}
            </div>
          </div>

          {/* Progress stepper (hidden if cancelled) */}
          {!isCancelled && (
            <div className="sf-track-stepper">
              {STATUS_STEPS.map((step, i) => (
                <div key={step} className={`sf-track-step ${i <= currentStepIndex ? 'done' : ''} ${i === currentStepIndex ? 'current' : ''}`}>
                  <div className="sf-track-step-circle">
                    {i < currentStepIndex ? '✓' : i + 1}
                  </div>
                  <div className="sf-track-step-label">{STATUS_LABELS[step]}</div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={`sf-track-step-line ${i < currentStepIndex ? 'done' : ''}`} />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="sf-track-body">
            {/* Timeline */}
            <div className="sf-track-card">
              <h2 className="sf-track-card-title">Order Timeline</h2>
              <div className="sf-order-timeline">
                {[...order.timeline].reverse().map(entry => (
                  <div key={entry.id} className="sf-timeline-entry">
                    <div className="sf-timeline-dot" />
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

            {/* Items */}
            <div className="sf-track-card">
              <h2 className="sf-track-card-title">Items</h2>
              {order.items.map(item => (
                <div key={item.id} className="sf-review-item">
                  <span>
                    {item.productName}
                    {item.variantName ? ` (${item.variantName})` : ''}
                    {' '}× {item.quantity}
                  </span>
                  <span>৳{Number(item.subtotal).toLocaleString()}</span>
                </div>
              ))}
              <div className="sf-review-total">
                <strong>Total</strong>
                <strong>৳{Number(order.total).toLocaleString()}</strong>
              </div>
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                Payment: {PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}
              </p>
            </div>

            {/* Delivery */}
            <div className="sf-track-card">
              <h2 className="sf-track-card-title">Delivery Address</h2>
              <p style={{ fontSize: '0.9375rem', color: '#374151' }}>
                {order.shippingAddress.line1}<br />
                {order.shippingAddress.city}, {order.shippingAddress.district}
              </p>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <Link href="/" className="sf-back-link">← Back to shop</Link>
      </div>
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={<div className="sf-container" style={{ paddingTop: '3rem' }}><p>Loading…</p></div>}>
      <TrackPageInner />
    </Suspense>
  );
}
