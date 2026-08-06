'use client';

import { useShop } from '../../_components/StorefrontShell';
import { shopHref } from '../../_components/shop-href';

// Customer sign-in is disabled.
//
// This page used to take a phone number and POST it to /v1/customer/auth/login,
// which handed back a 30-day session to anyone who typed a phone number that had
// placed an order — no password, no code, no proof. That endpoint now returns 410.
//
// Order lookup still works, and always did: /track asks for the order NUMBER as
// well as the phone, so it only reveals an order to someone who already has its
// number. Real customer accounts (email + password + a verification code at
// signup) land here in a later phase — see docs/customer-accounts-plan.md.

export default function CustomerLoginPage() {
  const { subdomain } = useShop();

  return (
    <div className="sf-container" style={{ maxWidth: 400, margin: '3rem auto', padding: '0 1rem' }}>
      <div style={{
        background: '#fff',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        padding: '2rem',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.375rem' }}>
          Track your order
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem', lineHeight: 1.55 }}>
          Customer accounts aren&apos;t available yet. To see the status of an order,
          use order tracking — you&apos;ll need your order number and the phone number
          you ordered with.
        </p>

        <a
          href={shopHref('/track', subdomain)}
          className="btn btn-primary"
          style={{
            display: 'block',
            textAlign: 'center',
            textDecoration: 'none',
            background: 'var(--sf-primary)',
            borderColor: 'var(--sf-primary)',
          }}
        >
          Track an order
        </a>

        <p style={{ fontSize: '0.8125rem', color: '#9ca3af', marginTop: '1rem', textAlign: 'center' }}>
          Your order number is in your confirmation email and on the confirmation page.
        </p>
      </div>
    </div>
  );
}
