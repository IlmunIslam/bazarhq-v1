import { Resend } from 'resend';
import type { Transport, EmailMessage, SendResult } from './transport';

/**
 * DORMANT (§2.5). Preserved verbatim from the pre-Sprint-0 `services/email.ts`,
 * not deleted.
 *
 * With EMAIL_PROVIDER=smtp this module is never required and no Resend client
 * is ever constructed. It exists so that buying a domain later is a config
 * change, not a rewrite:
 *
 *     EMAIL_PROVIDER=resend
 *     RESEND_API_KEY=<key>
 *     RESEND_FROM_EMAIL=noreply@<the new domain>
 *
 * and redeploy. No code change.
 *
 * Note it must send from a Resend-VERIFIED domain — pointing RESEND_FROM_EMAIL
 * at a @gmail.com address fails DMARC alignment (and Resend refuses it), which
 * is the whole reason Gmail SMTP is the active transport today.
 */

const FROM = process.env.RESEND_FROM_EMAIL ?? 'noreply@bazarhq.com';

let _client: Resend | null = null;

function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_client) _client = new Resend(process.env.RESEND_API_KEY);
  return _client;
}

export const resendTransport: Transport = {
  name: 'resend',

  isConfigured(): boolean {
    return Boolean(process.env.RESEND_API_KEY);
  },

  async send(msg: EmailMessage): Promise<SendResult> {
    const client = getClient();
    if (!client) throw new Error('RESEND_API_KEY is not set');

    const { data, error } = await client.emails.send({
      from: FROM,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
    });

    // The SDK reports failures in the envelope rather than by rejecting, so an
    // unchecked call would look like a success.
    if (error) throw new Error(error.message);

    return { messageId: data?.id ?? '' };
  },
};
