import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { requireMerchant } from '../middleware/auth';
import { publicRateLimit } from '../middleware/rate-limiter';
import { ok, created, fail } from '../utils/response';
import { signToken } from '../utils/jwt';
import { authCookieOptions, clearCookieOptions } from '../utils/cookies';
import { getRedis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import * as emailService from '../services/email';

const router = Router();

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2).max(100),
  phone: z.string().optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const VerifyEmailSchema = z.object({
  token: z.string(),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

const ResetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// POST /v1/auth/register
router.post('/register', publicRateLimit, validate(RegisterSchema), async (req, res) => {
  const { email, password, fullName, phone } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return fail(res, 409, 'EMAIL_TAKEN', 'An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, fullName, phone: phone ?? null },
  });

  const token = randomBytes(32).toString('hex');
  await prisma.emailVerification.create({
    data: {
      userId: user.id,
      token,
      type: 'email_verification',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    },
  });

  await emailService.sendVerificationEmail(user.email, user.fullName, token);

  return created(res, {
    message: 'Account created. Please check your email to verify your account.',
  });
});

// POST /v1/auth/verify-email
router.post('/verify-email', publicRateLimit, validate(VerifyEmailSchema), async (req, res) => {
  const { token } = req.body;

  const record = await prisma.emailVerification.findUnique({ where: { token } });

  if (!record || record.type !== 'email_verification') {
    return fail(res, 400, 'INVALID_TOKEN', 'Invalid verification link');
  }
  if (record.usedAt) return fail(res, 400, 'TOKEN_USED', 'This link has already been used');
  if (record.expiresAt < new Date()) return fail(res, 400, 'TOKEN_EXPIRED', 'This link has expired. Please register again.');

  await prisma.$transaction([
    prisma.emailVerification.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } }),
  ]);

  return ok(res, { message: 'Email verified. You can now log in.' });
});

// POST /v1/auth/login
router.post('/login', publicRateLimit, validate(LoginSchema), async (req, res) => {
  const { email, password } = req.body;
  const redis = getRedis();

  // Brute force lockout check
  if (redis) {
    const locked = await redis.get(`bf:lock:${email}`);
    if (locked) {
      return fail(res, 429, 'ACCOUNT_LOCKED', 'Too many failed login attempts. Please try again in 30 minutes.');
    }
  }

  const recordFailure = async () => {
    if (!redis) return;
    const countKey = `bf:count:${email}`;
    const count = await redis.incr(countKey);
    if (count === 1) await redis.expire(countKey, 30 * 60);
    if (count >= 5) {
      await redis.set(`bf:lock:${email}`, '1', { ex: 30 * 60 });
      await redis.del(countKey);
    }
  };

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.passwordHash) {
    await recordFailure();
    return fail(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  if (user.status === 'suspended') {
    return fail(res, 403, 'ACCOUNT_SUSPENDED', 'Your account has been suspended. Contact support.');
  }

  if (!user.emailVerified) {
    return fail(res, 403, 'EMAIL_NOT_VERIFIED', 'Please verify your email before logging in');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await recordFailure();
    return fail(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  // Clear brute force counters on success
  if (redis) {
    await redis.del(`bf:count:${email}`);
    await redis.del(`bf:lock:${email}`);
  }

  const { token, jti } = signToken({ sub: user.id, role: 'merchant' });

  await prisma.session.create({
    data: {
      jti,
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  // Web clients keep httpOnly-cookie auth exactly as before. Native clients
  // (React Native) can't read httpOnly cookies, so they opt in with the
  // `X-Client: mobile` header and receive the JWT in the response body to
  // persist in expo-secure-store. Either way the same Session row + jti back
  // the token, so it stays fully revocable regardless of client.
  const isMobile = req.get('x-client') === 'mobile';

  if (!isMobile) {
    res.cookie('token', token, authCookieOptions(7 * 24 * 60 * 60 * 1000));
  }

  return ok(res, {
    user: { id: user.id, email: user.email, fullName: user.fullName },
    ...(isMobile ? { token } : {}),
  });
});

// POST /v1/auth/logout
router.post('/logout', requireMerchant, async (req, res) => {
  await prisma.session.update({
    where: { jti: req.jti! },
    data: { revokedAt: new Date() },
  });

  res.clearCookie('token', clearCookieOptions());
  return ok(res, { message: 'Logged out successfully' });
});

// GET /v1/auth/me
router.get('/me', requireMerchant, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, fullName: true, phone: true, createdAt: true },
  });
  if (!user) return fail(res, 404, 'USER_NOT_FOUND', 'User not found');

  const shop = await prisma.shop.findUnique({
    where: { userId: user.id },
    select: { id: true, subdomain: true, name: true, status: true },
  });

  return ok(res, { user, shop });
});

// POST /v1/auth/forgot-password
router.post('/forgot-password', publicRateLimit, validate(ForgotPasswordSchema), async (req, res) => {
  const { email } = req.body;

  // Always return 200 — prevents email enumeration
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = randomBytes(32).toString('hex');
    await prisma.emailVerification.create({
      data: {
        userId: user.id,
        token,
        type: 'password_reset',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h
      },
    });
    await emailService.sendPasswordResetEmail(user.email, user.fullName, token);
  }

  return ok(res, {
    message: 'If an account with that email exists, we sent a password reset link.',
  });
});

// POST /v1/auth/reset-password
router.post('/reset-password', publicRateLimit, validate(ResetPasswordSchema), async (req, res) => {
  const { token, password } = req.body;

  const record = await prisma.emailVerification.findUnique({ where: { token } });

  if (!record || record.type !== 'password_reset') {
    return fail(res, 400, 'INVALID_TOKEN', 'Invalid or expired reset link');
  }
  if (record.usedAt) return fail(res, 400, 'TOKEN_USED', 'This reset link has already been used');
  if (record.expiresAt < new Date()) return fail(res, 400, 'TOKEN_EXPIRED', 'This reset link has expired');

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction([
    prisma.emailVerification.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    // Revoke all active sessions for security
    prisma.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  return ok(res, { message: 'Password reset successfully. You can now log in.' });
});

export default router;
