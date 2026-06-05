import { Resend } from 'resend';

const FROM = process.env.RESEND_FROM_EMAIL ?? 'noreply@bazarhq.com';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

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
