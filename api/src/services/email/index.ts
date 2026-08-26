import { deliver, EmailUnavailableError } from './transport';

export { EmailUnavailableError, getQuotaUsage, hashEmail } from './transport';
export type { EmailMessage, Transport } from './transport';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

// ─── Order email types ────────────────────────────────────────────────────────

interface OrderEmailData {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  total: number | { toNumber(): number };
  paymentMethod: string;
  items: Array<{ productName: string; variantName?: string | null; quantity: number; subtotal: number | { toNumber(): number } }>;
  shippingAddress: { line1: string; city: string; district: string };
}

interface ShopEmailData {
  name: string;
  subdomain: string;
}

const PAYMENT_LABELS: Record<string, string> = { cod: 'Cash on Delivery', bkash: 'bKash', nagad: 'Nagad' };
const STATUS_LABELS: Record<string, string> = {
  pending: 'Order Placed', confirmed: 'Confirmed', processing: 'Processing',
  shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled',
};

function money(v: number | { toNumber(): number }): string {
  const n = typeof v === 'number' ? v : v.toNumber();
  return `৳${n.toLocaleString('en-BD')}`;
}

function itemsHtml(order: OrderEmailData): string {
  return order.items.map(i =>
    `<tr>
      <td style="padding:6px 0;">${i.productName}${i.variantName ? ` (${i.variantName})` : ''} × ${i.quantity}</td>
      <td style="padding:6px 0;text-align:right;">${money(i.subtotal)}</td>
    </tr>`
  ).join('');
}

function trackingLink(subdomain: string, orderNumber: string): string {
  const base = process.env.NODE_ENV === 'production'
    ? `https://${subdomain}.bazarhq.com`
    : `${FRONTEND_URL}?_shop=${subdomain}`;
  return `${base}/track?orderNumber=${orderNumber}`;
}

// ─── Transactional gate (Sprint 0, default OFF) ───────────────────────────────

/**
 * The four order/merchant senders below have never delivered a message in
 * production — RESEND_API_KEY was always empty. The moment a working transport
 * lands they would all start sending at once, to real customers and merchants,
 * off the same shared 300/day Brevo quota that the OTP path depends on.
 *
 * So they stay gated until OTP is proven in production, then this flips to
 * "true" in the Render dashboard deliberately. Read per-call, not cached, so
 * flipping it needs a restart at most — never a redeploy.
 *
 * NOT gated: sendPasswordResetEmail. It is account recovery, user-initiated and
 * rare; gating it would leave a locked-out merchant with no route back in and
 * no error to act on. Its quota draw is negligible.
 */
function transactionalEmailEnabled(): boolean {
  return (process.env.TRANSACTIONAL_EMAIL_ENABLED ?? 'false').trim().toLowerCase() === 'true';
}

function gated(template: string, to: string): boolean {
  if (transactionalEmailEnabled()) return false;
  console.log(`[email] ${template} → ${to} suppressed (TRANSACTIONAL_EMAIL_ENABLED=false)`);
  return true;
}

// ─── The five pre-existing senders ────────────────────────────────────────────
// Signatures and failure semantics are unchanged (§2.5). Templates moved
// verbatim. Only the transport underneath is different.

export async function sendVerificationEmail(
  email: string,
  name: string,
  token: string
): Promise<void> {
  if (gated('verification', email)) return;
  const link = `${FRONTEND_URL}/verify-email?token=${token}`;

  await deliver('verification', {
    to: email,
    subject: 'Verify your BazarHQ account',
    html: `
      <h2>Welcome to BazarHQ, ${name}!</h2>
      <p>Click the link below to verify your email address:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in 24 hours.</p>
    `,
  }, { throwOnFailure: true });
}

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  token: string
): Promise<void> {
  const link = `${FRONTEND_URL}/reset-password?token=${token}`;

  await deliver('password_reset', {
    to: email,
    subject: 'Reset your BazarHQ password',
    html: `
      <h2>Password Reset</h2>
      <p>Hi ${name}, click the link below to reset your password:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
    `,
  }, { throwOnFailure: true });
}

// ─── Order confirmation → customer ────────────────────────────────────────────

export async function sendOrderConfirmation(
  order: OrderEmailData,
  shop: ShopEmailData,
): Promise<void> {
  if (!order.customerEmail) return;
  if (gated('order_confirmation', order.customerEmail)) return;
  const trackLink = trackingLink(shop.subdomain, order.orderNumber);

  await deliver('order_confirmation', {
    to: order.customerEmail,
    subject: `Your order #${order.orderNumber} is confirmed — ${shop.name}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111827">
        <h2 style="margin-bottom:4px">${shop.name}</h2>
        <h3 style="color:#16a34a;margin-top:0">Order Confirmed!</h3>
        <p>Hi ${order.customerName}, your order has been placed successfully.</p>
        <p><strong>Order #:</strong> ${order.orderNumber}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          ${itemsHtml(order)}
          <tr style="border-top:1px solid #e5e7eb">
            <td style="padding:8px 0"><strong>Total</strong></td>
            <td style="padding:8px 0;text-align:right"><strong>${money(order.total)}</strong></td>
          </tr>
        </table>
        <p><strong>Payment:</strong> ${PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}</p>
        <p><strong>Delivering to:</strong> ${order.shippingAddress.line1}, ${order.shippingAddress.city}, ${order.shippingAddress.district}</p>
        <p style="margin-top:24px">
          <a href="${trackLink}" style="background:#111827;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">
            Track Your Order
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px;margin-top:24px">Powered by BazarHQ</p>
      </div>
    `,
  });
}

// ─── New order alert → merchant ───────────────────────────────────────────────

export async function sendMerchantNewOrder(
  order: OrderEmailData,
  merchantEmail: string,
  shop: ShopEmailData,
): Promise<void> {
  if (gated('merchant_new_order', merchantEmail)) return;
  const dashboardLink = `${FRONTEND_URL}/dashboard/orders`;

  await deliver('merchant_new_order', {
    to: merchantEmail,
    subject: `New order #${order.orderNumber} on ${shop.name}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111827">
        <h2 style="margin-bottom:4px">New Order Received</h2>
        <p><strong>#${order.orderNumber}</strong> — ${order.customerName} (${order.customerPhone})</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          ${itemsHtml(order)}
          <tr style="border-top:1px solid #e5e7eb">
            <td style="padding:8px 0"><strong>Total</strong></td>
            <td style="padding:8px 0;text-align:right"><strong>${money(order.total)}</strong></td>
          </tr>
        </table>
        <p><strong>Payment:</strong> ${PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}</p>
        <p><strong>Deliver to:</strong> ${order.shippingAddress.line1}, ${order.shippingAddress.city}, ${order.shippingAddress.district}</p>
        <p style="margin-top:24px">
          <a href="${dashboardLink}" style="background:#111827;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">
            View in Dashboard
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px;margin-top:24px">BazarHQ Merchant Notifications</p>
      </div>
    `,
  });
}

// ─── Status update → customer ─────────────────────────────────────────────────

export async function sendOrderStatusUpdate(
  order: OrderEmailData & { status: string },
  shop: ShopEmailData,
): Promise<void> {
  if (!order.customerEmail) return;
  if (gated('order_status_update', order.customerEmail)) return;
  const trackLink = trackingLink(shop.subdomain, order.orderNumber);
  const statusLabel = STATUS_LABELS[order.status] ?? order.status;

  await deliver('order_status_update', {
    to: order.customerEmail,
    subject: `Order #${order.orderNumber} ${statusLabel} — ${shop.name}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111827">
        <h2 style="margin-bottom:4px">${shop.name}</h2>
        <h3 style="margin-top:0">Order Update: ${statusLabel}</h3>
        <p>Hi ${order.customerName}, your order <strong>#${order.orderNumber}</strong> has been updated.</p>
        <p style="font-size:1.25rem;font-weight:700;color:#111827">${statusLabel}</p>
        <p style="margin-top:16px">
          <a href="${trackLink}" style="background:#111827;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">
            Track Your Order
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px;margin-top:24px">Powered by BazarHQ</p>
      </div>
    `,
  });
}

// ─── Admin test send (§2.7 proof-of-delivery) ─────────────────────────────────

/**
 * Proves delivery from production without going through a signup.
 *
 * Throws like the OTP path so a broken transport is loud, and deliberately
 * ignores TRANSACTIONAL_EMAIL_ENABLED — this is the tool used to prove the
 * transport works *before* that flag is flipped.
 *
 * @throws EmailUnavailableError with the transport's verbatim error.
 */
export async function sendTestEmail(email: string, note?: string): Promise<string> {
  const sentAt = new Date().toISOString();

  const messageId = await deliver('admin_test', {
    to: email,
    subject: 'BazarHQ email transport test',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111827">
        <h2 style="margin-bottom:4px">Transport test</h2>
        <p>If you are reading this in an <strong>inbox</strong> (not spam), the BazarHQ email transport works end to end.</p>
        <p style="color:#6b7280;font-size:13px">Sent at ${sentAt}</p>
        ${note ? `<p style="color:#6b7280;font-size:13px">Note: ${note}</p>` : ''}
        <p style="color:#6b7280;font-size:13px;margin-top:24px">Powered by BazarHQ</p>
      </div>
    `,
  }, { throwOnUnconfigured: true, throwOnFailure: true });

  if (!messageId) {
    throw new EmailUnavailableError('send_failed', 'transport returned no messageId');
  }

  return messageId;
}

// ─── OTP — INVERTED SEMANTICS (§2.6) ──────────────────────────────────────────

/**
 * The one sender that THROWS. Non-negotiable, and the opposite of every sender
 * above.
 *
 * For an order receipt, a silent no-op is tolerable. For a login code it is the
 * worst possible failure: the signup reports success, the customer waits on a
 * code-entry screen for mail that was never sent, and nothing anywhere records
 * a problem.
 *
 * The caller MUST therefore:
 *   - run this INSIDE the transaction that creates the OTP challenge, so the
 *     throw rolls the challenge row back — a failure the user did not cause
 *     must not burn their 3-per-15-min send allowance; and
 *   - map EmailUnavailableError to 503 EMAIL_UNAVAILABLE.
 *
 * Deliberately NOT gated by TRANSACTIONAL_EMAIL_ENABLED: OTP is the critical
 * path the flag exists to protect.
 *
 * @throws EmailUnavailableError when unconfigured, quota-exhausted, or the send fails.
 * @returns provider messageId, to be recorded so "I never got the code" is diagnosable.
 */
export async function sendOtpEmail(
  email: string,
  code: string,
  opts: { expiryMinutes?: number } = {},
): Promise<string> {
  const expiryMinutes = opts.expiryMinutes ?? 10;

  const messageId = await deliver('otp', {
    to: email,
    subject: `${code} is your BazarHQ verification code`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111827">
        <h2 style="margin-bottom:4px">Your verification code</h2>
        <p style="font-size:2rem;font-weight:700;letter-spacing:0.3em;margin:24px 0;color:#111827">${code}</p>
        <p>This code expires in ${expiryMinutes} minutes.</p>
        <p style="color:#6b7280;font-size:13px;margin-top:24px">
          If you didn't request this code, you can ignore this email — nobody can use it without access to your inbox.
        </p>
        <p style="color:#6b7280;font-size:13px">Powered by BazarHQ</p>
      </div>
    `,
    // NOTE: the code appears in the subject and body above — that is the point
    // of the message. It must never reach a log line, a console path, or the
    // email_sends row (which stores only a template name and a recipient hash).
  }, { throwOnUnconfigured: true, throwOnFailure: true });

  // deliver() only returns null on a tolerated failure, and neither is tolerated
  // here; this keeps the non-null contract honest for the caller.
  if (!messageId) {
    throw new EmailUnavailableError('send_failed', 'transport returned no messageId');
  }

  return messageId;
}
