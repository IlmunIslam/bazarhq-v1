'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { shopHref } from '../../_components/shop-href';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Order Placed',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

interface OrderItem {
  id: string;
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
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number;
  shippingFee: number;
  total: number;
  customerName: string;
  customerPhone: string;
  shippingAddress: { line1: string; city: string; district: string; line2?: string };
  notes: string | null;
  createdAt: string;
  items: OrderItem[];
  timeline: TimelineEntry[];
}

function OrderConfirmationInner() {
  const params = useParams<{ shop: string; orderNumber: string }>();
  const searchParams = useSearchParams();
  const phone = searchParams.get('phone') ?? '';
  const subdomain = params.shop;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!params.orderNumber || !phone) {
      setError('Invalid confirmation link.');
      setLoading(false);
      return;
    }
    fetch(`${API}/orders/track?orderNumber=${encodeURIComponent(params.orderNumber)}&phone=${encodeURIComponent(phone)}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setOrder(json.data.order);
        else setError('Order not found. Please check your phone number.');
      })
      .catch(() => setError('Failed to load order details.'))
      .finally(() => setLoading(false));
  }, [params.orderNumber, phone]);

  if (loading) {
    return (
      <div className="sf-container" style={{ paddingTop: '3rem', textAlign: 'center' }}>
        <p>Loading your order…</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="sf-container sf-empty" style={{ paddingTop: '3rem' }}>
        <p>{error || 'Order not found.'}</p>
        <Link href={shopHref('/', subdomain)} className="sf-back-link">← Back to shop</Link>
      </div>
    );
  }

  const PAYMENT_LABELS: Record<string, string> = { cod: 'Cash on Delivery', bkash: 'bKash', nagad: 'Nagad' };

  return (
    <div className="sf-container sf-order-confirmation">
      <div className="sf-confirmation-header">
        <div className="sf-confirmation-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1>Order Placed!</h1>
        <p className="sf-confirmation-number">#{order.orderNumber}</p>
        <p>We&apos;ll keep you updated. Check back here anytime using your phone number.</p>
      </div>

      <div className="sf-confirmation-body">
        {/* Timeline */}
        <div className="sf-confirmation-card">
          <h2>Order Status</h2>
          <div className="sf-order-timeline">
            {order.timeline.map((entry) => (
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
        <div className="sf-confirmation-card">
          <h2>Items</h2>
          {order.items.map(item => (
            <div key={item.id} className="sf-review-item">
              <span>{item.productName}{item.variantName ? ` (${item.variantName})` : ''} × {item.quantity}</span>
              <span>৳{Number(item.subtotal).toLocaleString()}</span>
            </div>
          ))}
          <div className="sf-review-total" style={{ marginTop: '0.75rem' }}>
            <strong>Total</strong>
            <strong>৳{Number(order.total).toLocaleString()}</strong>
          </div>
        </div>

        {/* Delivery & Payment */}
        <div className="sf-confirmation-card">
          <h2>Delivery</h2>
          <p>{order.customerName} · {order.customerPhone}</p>
          <p>{order.shippingAddress.line1}, {order.shippingAddress.city}, {order.shippingAddress.district}</p>
          <p style={{ marginTop: '0.75rem' }}>
            <strong>Payment:</strong> {PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}
          </p>
          {order.notes && <p><strong>Notes:</strong> {order.notes}</p>}
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <Link href={shopHref('/', subdomain)} className="sf-checkout-next-btn">Continue Shopping</Link>
      </div>
    </div>
  );
}

export default function OrderConfirmationPage() {
  return (
    <Suspense fallback={<div className="sf-container" style={{ paddingTop: '3rem' }}><p>Loading…</p></div>}>
      <OrderConfirmationInner />
    </Suspense>
  );
}
