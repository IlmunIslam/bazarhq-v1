import { Router } from 'express';
import { z } from 'zod';
import { requireMerchant } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { ok, fail } from '../utils/response';
import { prisma } from '../lib/prisma';
import { encrypt, decrypt, maskSecret } from '../utils/encryption';

const router = Router();

router.use(requireMerchant);

// Credentials shape for bKash / Nagad
const BkashCredsSchema = z.object({
  accountNumber: z.string().min(10).max(20),
});

const NagadCredsSchema = z.object({
  accountNumber: z.string().min(10).max(20),
});

const UpdatePaymentConfigSchema = z.object({
  isEnabled: z.boolean(),
  credentials: z.record(z.string()).optional(),
});

// ─── GET /v1/payment-configs ─────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const configs = await prisma.paymentConfig.findMany({ where: { shopId: shop.id } });

  // Mask credentials — only expose last 4 chars of each field
  const masked = configs.map((c) => {
    if (!c.credentials) return { ...c, credentials: null };
    const raw = c.credentials as Record<string, string>;
    const maskedCreds: Record<string, string> = {};
    for (const [key, encVal] of Object.entries(raw)) {
      try {
        const plain = decrypt(encVal);
        maskedCreds[key] = maskSecret(plain);
      } catch {
        maskedCreds[key] = '****';
      }
    }
    return { ...c, credentials: maskedCreds };
  });

  return ok(res, { configs: masked });
});

// ─── PATCH /v1/payment-configs/:method ───────────────────────────────────────

router.patch('/:method', validate(UpdatePaymentConfigSchema), async (req, res) => {
  const { method } = req.params;
  const ALLOWED = ['cod', 'bkash', 'nagad'] as const;
  if (!ALLOWED.includes(method as typeof ALLOWED[number])) {
    return fail(res, 422, 'INVALID_METHOD', 'Payment method must be cod, bkash, or nagad');
  }

  const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
  if (!shop) return fail(res, 404, 'SHOP_NOT_FOUND', 'Shop not found');

  const { isEnabled, credentials } = req.body as { isEnabled: boolean; credentials?: Record<string, string> };

  // Validate credential shape per method
  let encryptedCreds: Record<string, string> | null = null;
  if (method === 'bkash' && credentials) {
    const parsed = BkashCredsSchema.safeParse(credentials);
    if (!parsed.success) {
      return fail(res, 422, 'INVALID_CREDENTIALS', 'bKash requires a valid accountNumber (10–20 digits)');
    }
    encryptedCreds = { accountNumber: encrypt(parsed.data.accountNumber) };
  } else if (method === 'nagad' && credentials) {
    const parsed = NagadCredsSchema.safeParse(credentials);
    if (!parsed.success) {
      return fail(res, 422, 'INVALID_CREDENTIALS', 'Nagad requires a valid accountNumber (10–20 digits)');
    }
    encryptedCreds = { accountNumber: encrypt(parsed.data.accountNumber) };
  }

  // Fetch existing config to preserve credentials if not provided
  const existing = await prisma.paymentConfig.findUnique({
    where: { shopId_method: { shopId: shop.id, method: method as 'cod' } },
  });

  const updatedConfig = await prisma.paymentConfig.upsert({
    where: { shopId_method: { shopId: shop.id, method: method as 'cod' } },
    create: {
      shopId: shop.id,
      method: method as 'cod',
      isEnabled,
      credentials: encryptedCreds ?? undefined,
    },
    update: {
      isEnabled,
      ...(encryptedCreds !== null ? { credentials: encryptedCreds } : {}),
    },
  });

  // Mask in response
  let maskedCredentials: Record<string, string> | null = null;
  const savedCreds = (encryptedCreds ?? (existing?.credentials as Record<string, string> | null));
  if (savedCreds) {
    maskedCredentials = {};
    for (const [key, encVal] of Object.entries(savedCreds)) {
      try {
        const plain = decrypt(encVal);
        maskedCredentials[key] = maskSecret(plain);
      } catch {
        maskedCredentials[key] = '****';
      }
    }
  }

  return ok(res, { config: { ...updatedConfig, credentials: maskedCredentials } });
});

export default router;
