import { Router } from 'express';
import { validate } from '../middleware/validate';
import { publicRateLimit } from '../middleware/rate-limiter';
import { z } from 'zod';

const router = Router();

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  phone: z.string().optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// POST /v1/auth/register
router.post('/register', publicRateLimit, validate(RegisterSchema), async (_req, res) => {
  res.status(501).json({ message: 'TODO' });
});

// POST /v1/auth/login
router.post('/login', publicRateLimit, validate(LoginSchema), async (_req, res) => {
  res.status(501).json({ message: 'TODO' });
});

// POST /v1/auth/logout
router.post('/logout', async (_req, res) => {
  res.status(501).json({ message: 'TODO' });
});

// POST /v1/auth/verify-email
router.post('/verify-email', publicRateLimit, async (_req, res) => {
  res.status(501).json({ message: 'TODO' });
});

// POST /v1/auth/forgot-password
router.post('/forgot-password', publicRateLimit, async (_req, res) => {
  res.status(501).json({ message: 'TODO' });
});

// POST /v1/auth/reset-password
router.post('/reset-password', publicRateLimit, async (_req, res) => {
  res.status(501).json({ message: 'TODO' });
});

export default router;
