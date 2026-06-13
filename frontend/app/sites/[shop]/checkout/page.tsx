'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useShop, useCart } from '../_components/StorefrontShell';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';

const DISTRICTS = [
  'Dhaka','Chittagong','Khulna','Sylhet','Rajshahi','Barisal','Rangpur','Mymensingh',
  'Comilla','Narayanganj','Gazipur','Narsingdi','Munshiganj','Faridpur','Tangail',
  'Manikganj','Kishoreganj','Netrokona','Jamalpur','Sherpur','Dinajpur','Bogra',
  'Sirajganj','Natore','Naogaon','Chapai Nawabganj','Rajshahi','Pabna','Kurigram',
  'Gaibandha','Nilphamari','Lalmonirhat','Thakurgaon','Panchagarh','Jessore','Khulna',
  'Satkhira','Bagerhat','Narail','Magura','Jhenaidah','Chuadanga','Meherpur','Kushtia',
  'Barguna','Barisal','Bhola','Jhalokathi','Patuakhali','Pirojpur','Bandarban',
  'Brahmanbaria','Chandpur','Chittagong','Cox\'s Bazar','Feni','Khagrachhari',
  'Lakshmipur','Noakhali','Rangamati','Habiganj','Moulvibazar','Sunamganj','Sylhet',
];

type Step = 1 | 2 | 3;

interface DeliveryForm {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  line1: string;
  city: string;
  district: string;
  notes: string;
}

const EMPTY_DELIVERY: DeliveryForm = {
  customerName: '', customerPhone: '', customerEmail: '',
  line1: '', city: '', district: '', notes: '',
};

const PAYMENT_LABELS: Record<string, string> = {
  cod: 'Cash on Delivery',
  bkash: 'bKash',
  nagad: 'Nagad',
};

export default function CheckoutPage() {
  const router = useRouter();
  const { shop, subdomain, paymentMethods } = useShop();
  const { items, total, clear } = useCart();

  const [step, setStep] = useState<Step>(1);
  const [delivery, setDelivery] = useState<DeliveryForm>(EMPTY_DELIVERY);
  const [paymentMethod, setPaymentMethod] = useState<string>(paymentMethods[0] ?? 'cod');
  const [transactionId, setTransactionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (items.length === 0) {
    return (
      <div className="sf-container sf-empty">
        <svg className="sf-empty-icon" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8" cy="21" r="1" />
          <circle cx="19" cy="21" r="1" />
          <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
        </svg>
        <p className="sf-empty-title">Your cart is empty</p>
        <p className="sf-empty-sub">Add items to your cart before checking out.</p>
        <Link href="/" className="sf-empty-cta">Start shopping</Link>
      </div>
    );
  }

  // ── Validation ───────────────────────────────────────────────────────────────

  function validateStep1(): boolean {
    const e: Record<string, string> = {};
    if (!delivery.customerName.trim()) e.customerName = 'Name is required';
    if (!/^01[3-9]\d{8}$/.test(delivery.customerPhone)) e.customerPhone = 'Enter a valid Bangladeshi phone number (e.g. 01712345678)';
    if (!delivery.line1.trim()) e.line1 = 'Address is required';
    if (!delivery.city.trim()) e.city = 'City is required';
    if (!delivery.district) e.district = 'District is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep2(): boolean {
    const e: Record<string, string> = {};
    if ((paymentMethod === 'bkash' || paymentMethod === 'nagad') && !transactionId.trim()) {
      e.transactionId = 'Transaction ID is required';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Submit ───────────────────────────────────────────────────────────────────

  async function placeOrder() {
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/orders/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subdomain,
          customerName: delivery.customerName.trim(),
          customerPhone: delivery.customerPhone.trim(),
          customerEmail: delivery.customerEmail.trim() || undefined,
          shippingAddress: {
            line1: delivery.line1.trim(),
            city: delivery.city.trim(),
            district: delivery.district,
          },
          paymentMethod,
          transactionId: transactionId.trim() || undefined,
          notes: delivery.notes.trim() || undefined,
          items: items.map(i => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        clear();
        router.push(`/order-confirmation/${json.data.order.orderNumber}?phone=${encodeURIComponent(delivery.customerPhone)}`);
      } else {
        setErrors({ submit: json.error?.message ?? 'Failed to place order. Please try again.' });
        setSubmitting(false);
      }
    } catch {
      setErrors({ submit: 'Network error. Please check your connection and try again.' });
      setSubmitting(false);
    }
  }

  // ── Field helpers ─────────────────────────────────────────────────────────────

  function field(key: keyof DeliveryForm, label: string, type = 'text', placeholder = '') {
    return (
      <div className="sf-field">
        <label className="sf-field-label">{label}</label>
        <input
          type={type}
          className={`sf-field-input ${errors[key] ? 'sf-field-error' : ''}`}
          placeholder={placeholder}
          value={delivery[key]}
          onChange={e => { setDelivery(d => ({ ...d, [key]: e.target.value })); setErrors(ev => { const n = { ...ev }; delete n[key]; return n; }); }}
        />
        {errors[key] && <p className="sf-field-msg">{errors[key]}</p>}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="sf-container sf-checkout">
      <h1 className="sf-checkout-title">Checkout</h1>

      {/* Progress bar */}
      <div className="sf-checkout-steps">
        {(['Delivery', 'Payment', 'Review'] as const).map((label, i) => (
          <div key={label} className={`sf-checkout-step ${step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''}`}>
            <div className="sf-step-circle">{step > i + 1 ? '✓' : i + 1}</div>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="sf-checkout-body">
        {/* ── Step 1: Delivery ── */}
        {step === 1 && (
          <div className="sf-checkout-form">
            <h2 className="sf-checkout-section-title">Delivery Information</h2>
            {field('customerName', 'Full Name', 'text', 'Your full name')}
            {field('customerPhone', 'Phone Number', 'tel', '01XXXXXXXXX')}
            {field('customerEmail', 'Email (optional)', 'email', 'your@email.com')}
            {field('line1', 'Address', 'text', 'House/Road/Area')}
            {field('city', 'City', 'text', 'e.g. Dhaka')}

            <div className="sf-field">
              <label className="sf-field-label">District</label>
              <select
                className={`sf-field-input ${errors.district ? 'sf-field-error' : ''}`}
                value={delivery.district}
                onChange={e => { setDelivery(d => ({ ...d, district: e.target.value })); setErrors(ev => { const n = { ...ev }; delete n.district; return n; }); }}
              >
                <option value="">Select district…</option>
                {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {errors.district && <p className="sf-field-msg">{errors.district}</p>}
            </div>

            <div className="sf-field">
              <label className="sf-field-label">Order Notes (optional)</label>
              <textarea
                className="sf-field-input sf-field-textarea"
                placeholder="Any special instructions…"
                value={delivery.notes}
                onChange={e => setDelivery(d => ({ ...d, notes: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="sf-checkout-nav">
              <Link href="/cart" className="sf-back-link">← Back to cart</Link>
              <button className="sf-checkout-next-btn" onClick={() => { if (validateStep1()) setStep(2); }}>
                Continue to Payment →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Payment ── */}
        {step === 2 && (
          <div className="sf-checkout-form">
            <h2 className="sf-checkout-section-title">Payment Method</h2>
            <div className="sf-payment-options">
              {paymentMethods.map(m => (
                <label key={m} className={`sf-payment-option ${paymentMethod === m ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="payment"
                    value={m}
                    checked={paymentMethod === m}
                    onChange={() => { setPaymentMethod(m); setTransactionId(''); setErrors({}); }}
                  />
                  <span className="sf-payment-label">{PAYMENT_LABELS[m] ?? m}</span>
                </label>
              ))}
            </div>

            {paymentMethod === 'cod' && (
              <p className="sf-payment-note">Pay in cash when your order is delivered.</p>
            )}

            {(paymentMethod === 'bkash' || paymentMethod === 'nagad') && (
              <div className="sf-field" style={{ marginTop: '1rem' }}>
                <label className="sf-field-label">Transaction ID</label>
                <input
                  type="text"
                  className={`sf-field-input ${errors.transactionId ? 'sf-field-error' : ''}`}
                  placeholder={`Enter your ${PAYMENT_LABELS[paymentMethod]} transaction ID`}
                  value={transactionId}
                  onChange={e => { setTransactionId(e.target.value); setErrors({}); }}
                />
                {errors.transactionId && <p className="sf-field-msg">{errors.transactionId}</p>}
              </div>
            )}

            <div className="sf-checkout-nav">
              <button className="sf-back-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setStep(1)}>← Back</button>
              <button className="sf-checkout-next-btn" onClick={() => { if (validateStep2()) setStep(3); }}>
                Review Order →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Review ── */}
        {step === 3 && (
          <div className="sf-checkout-form">
            <h2 className="sf-checkout-section-title">Review Your Order</h2>

            <div className="sf-review-section">
              <h3 className="sf-review-label">Delivering to</h3>
              <p>{delivery.customerName} · {delivery.customerPhone}</p>
              <p>{delivery.line1}, {delivery.city}, {delivery.district}</p>
            </div>

            <div className="sf-review-section">
              <h3 className="sf-review-label">Payment</h3>
              <p>{PAYMENT_LABELS[paymentMethod] ?? paymentMethod}
                {transactionId && <span className="text-muted"> · TxID: {transactionId}</span>}
              </p>
            </div>

            <div className="sf-review-section">
              <h3 className="sf-review-label">Items</h3>
              {items.map(item => (
                <div key={`${item.productId}:${item.variantId ?? ''}`} className="sf-review-item">
                  <span>{item.name}{item.variantName ? ` (${item.variantName})` : ''} × {item.quantity}</span>
                  <span>৳{(item.price * item.quantity).toLocaleString()}</span>
                </div>
              ))}
              <div className="sf-review-total">
                <strong>Total</strong>
                <strong>৳{total.toLocaleString()}</strong>
              </div>
            </div>

            {errors.submit && <p className="sf-field-msg" style={{ marginBottom: '1rem' }}>{errors.submit}</p>}

            <div className="sf-checkout-nav">
              <button className="sf-back-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setStep(2)}>← Back</button>
              <button
                className="sf-checkout-next-btn sf-place-order-btn"
                onClick={placeOrder}
                disabled={submitting}
              >
                {submitting ? 'Placing Order…' : 'Place Order'}
              </button>
            </div>
          </div>
        )}

        {/* Order summary sidebar */}
        <div className="sf-checkout-summary">
          <h3 className="sf-checkout-summary-title">Order Summary</h3>
          {items.map(item => (
            <div key={`${item.productId}:${item.variantId ?? ''}`} className="sf-checkout-summary-item">
              <span className="sf-checkout-summary-name">
                {item.name}{item.variantName ? ` (${item.variantName})` : ''} × {item.quantity}
              </span>
              <span>৳{(item.price * item.quantity).toLocaleString()}</span>
            </div>
          ))}
          <div className="sf-checkout-summary-total">
            <span>Total</span>
            <strong>৳{total.toLocaleString()}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
