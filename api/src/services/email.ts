import { Resend } from 'resend';

const FROM = process.env.RESEND_FROM_EMAIL ?? 'noreply@bazarhq.com';
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

function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

export async function sendVerificationEmail(
  email: string,
  name: string,
  token: string
): Promise<void> {
  const link = `${FRONTEND_URL}/verify-email?token=${token}`;
  const client = getClient();

  if (!client) {
    console.log(`[DEV] Verification email → ${email}\n  Link: ${link}`);
    return;
  }

  await client.emails.send({
    from: FROM,
    to: email,
    subject: 'Verify your BazarHQ account',
    html: `
      <h2>Welcome to BazarHQ, ${name}!</h2>
      <p>Click the link below to verify your email address:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in 24 hours.</p>
    `,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  token: string
): Promise<void> {
  const link = `${FRONTEND_URL}/reset-password?token=${token}`;
  const client = getClient();

  if (!client) {
    console.log(`[DEV] Password reset email → ${email}\n  Link: ${link}`);
    return;
  }

  await client.emails.send({
    from: FROM,
    to: email,
    subject: 'Reset your BazarHQ password',
    html: `
      <h2>Password Reset</h2>
      <p>Hi ${name}, click the link below to reset your password:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
    `,
  });
}

// ─── Order confirmation → customer ────────────────────────────────────────────

export async function sendOrderConfirmation(
  order: OrderEmailData,
  shop: ShopEmailData,
): Promise<void> {
  if (!order.customerEmail) return;
  const client = getClient();
  const trackLink = trackingLink(shop.subdomain, order.orderNumber);

  if (!client) {
    console.log(`[DEV] Order confirmation → ${order.customerEmail}  #${order.orderNumber}`);
    return;
  }

  await client.emails.send({
    from: FROM,
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
  }).catch((err: Error) => console.error('[email] order confirmation failed:', err.message));
}

// ─── New order alert → merchant ───────────────────────────────────────────────

export async function sendMerchantNewOrder(
  order: OrderEmailData,
  merchantEmail: string,
  shop: ShopEmailData,
): Promise<void> {
  const client = getClient();
  const dashboardLink = `${FRONTEND_URL}/dashboard/orders`;

  if (!client) {
    console.log(`[DEV] Merchant new order → ${merchantEmail}  #${order.orderNumber}`);
    return;
  }

  await client.emails.send({
    from: FROM,
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
  }).catch((err: Error) => console.error('[email] merchant new order failed:', err.message));
}

// ─── Status update → customer ─────────────────────────────────────────────────

export async function sendOrderStatusUpdate(
  order: OrderEmailData & { status: string },
  shop: ShopEmailData,
): Promise<void> {
  if (!order.customerEmail) return;
  const client = getClient();
  const trackLink = trackingLink(shop.subdomain, order.orderNumber);
  const statusLabel = STATUS_LABELS[order.status] ?? order.status;

  if (!client) {
    console.log(`[DEV] Status update → ${order.customerEmail}  #${order.orderNumber}  status=${order.status}`);
    return;
  }

  await client.emails.send({
    from: FROM,
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
  }).catch((err: Error) => console.error('[email] status update email failed:', err.message));
}
