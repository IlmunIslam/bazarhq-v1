'use client';

import Link from 'next/link';
import { useCart } from '../_components/StorefrontShell';

export default function CartPage() {
  const { items, total, update, remove, clear } = useCart();

  if (items.length === 0) {
    return (
      <div className="sf-container sf-empty" style={{ paddingTop: '4rem' }}>
        <p>Your cart is empty.</p>
        <Link href="/" className="sf-back-link">← Continue shopping</Link>
      </div>
    );
  }

  return (
    <div className="sf-container sf-cart">
      <h1 className="sf-cart-title">Your Cart</h1>

      <div className="sf-cart-layout">
        {/* Items */}
        <div className="sf-cart-items">
          {items.map(item => (
            <div key={`${item.productId}:${item.variantId ?? ''}`} className="sf-cart-item">
              <div className="sf-cart-item-img-wrap">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} className="sf-cart-item-img" />
                ) : (
                  <div className="sf-cart-item-img sf-no-img" />
                )}
              </div>

              <div className="sf-cart-item-info">
                <Link href={`/products/${item.slug}`} className="sf-cart-item-name">
                  {item.name}
                </Link>
                {item.variantName && (
                  <p className="sf-cart-item-variant">{item.variantName}</p>
                )}
                <p className="sf-cart-item-price">৳{item.price.toLocaleString()}</p>
              </div>

              <div className="sf-cart-item-right">
                <div className="sf-qty-control">
                  <button
                    className="sf-qty-btn"
                    onClick={() => update(item.productId, item.variantId, item.quantity - 1)}
                  >−</button>
                  <span className="sf-qty-val">{item.quantity}</span>
                  <button
                    className="sf-qty-btn"
                    onClick={() => update(item.productId, item.variantId, item.quantity + 1)}
                  >+</button>
                </div>
                <p className="sf-cart-item-subtotal">৳{(item.price * item.quantity).toLocaleString()}</p>
                <button
                  className="sf-cart-remove"
                  onClick={() => remove(item.productId, item.variantId)}
                  aria-label="Remove"
                >×</button>
              </div>
            </div>
          ))}

          <button className="sf-cart-clear" onClick={clear}>Clear cart</button>
        </div>

        {/* Summary */}
        <div className="sf-cart-summary">
          <h2 className="sf-cart-summary-title">Order Summary</h2>
          <div className="sf-cart-summary-row">
            <span>Subtotal</span>
            <span>৳{total.toLocaleString()}</span>
          </div>
          <div className="sf-cart-summary-row sf-cart-shipping">
            <span>Shipping</span>
            <span className="text-muted">Calculated at checkout</span>
          </div>
          <div className="sf-cart-summary-total">
            <span>Total</span>
            <span>৳{total.toLocaleString()}</span>
          </div>
          <Link href="/checkout" className="sf-checkout-btn" style={{ textAlign: 'center', display: 'block', textDecoration: 'none' }}>
            Proceed to Checkout
          </Link>
          <Link href="/" className="sf-back-link sf-cart-continue">← Continue shopping</Link>
        </div>
      </div>
    </div>
  );
}
