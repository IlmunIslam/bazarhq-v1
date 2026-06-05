import { Router } from 'express';
import { requireMerchant } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { publicRateLimit } from '../middleware/rate-limiter';
import { z } from 'zod';

const router = Router();

const CreateShopSchema = z.object({
  subdomain: z.string().min(3).max(30).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(60),
  description: z.string().max(500).optional(),
});

// GET /v1/shops/check-subdomain?subdomain=xxx
router.get('/check-subdomain', publicRateLimit, async (_req, res) => {
  res.status(501).json({ message: 'TODO' });
});

// POST /v1/shops
router.post('/', requireMerchant, validate(CreateShopSchema), async (_req, res) => {
  res.status(501).json({ message: 'TODO' });
});

// GET /v1/shops/me
router.get('/me', requireMerchant, async (_req, res) => {
  res.status(501).json({ message: 'TODO' });
});

// PATCH /v1/shops/me
router.patch('/me', requireMerchant, async (_req, res) => {
  res.status(501).json({ message: 'TODO' });
});

// POST /v1/shops/me/publish
router.post('/me/publish', requireMerchant, async (_req, res) => {
  res.status(501).json({ message: 'TODO' });
});

// GET /v1/shops/me/theme
router.get('/me/theme', requireMerchant, async (_req, res) => {
  res.status(501).json({ message: 'TODO' });
});

// PATCH /v1/shops/me/theme
router.patch('/me/theme', requireMerchant, async (_req, res) => {
  res.status(501).json({ message: 'TODO' });
});

export default router;
