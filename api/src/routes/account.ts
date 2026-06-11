import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { z } from 'zod';
import { requireMerchant } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { ok, fail } from '../utils/response';
import { prisma } from '../lib/prisma';
import { uploadStream } from '../services/cloudinary';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireMerchant);

const UpdateProfileSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  phone: z.string().regex(/^01[3-9]\d{8}$/).optional().nullable(),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

// GET /v1/account/me
router.get('/me', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, fullName: true, phone: true, createdAt: true },
  });
  if (!user) return fail(res, 404, 'USER_NOT_FOUND', 'User not found');
  return ok(res, { user });
});

// PATCH /v1/account/profile
router.patch('/profile', upload.single('avatar'), async (req, res) => {
  const body = {
    fullName: req.body.fullName || undefined,
    phone: req.body.phone === '' ? null : req.body.phone || undefined,
  };

  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return fail(res, 422, 'VALIDATION_ERROR', parsed.error.errors[0].message);
  }

  let avatarUrl: string | undefined;
  if (req.file) {
    const result = await uploadStream(req.file.buffer, 'bazarhq/avatars', {
      transformation: [{ width: 200, height: 200, crop: 'fill' }],
    });
    avatarUrl = result.url;
  }

  const updateData: Record<string, string | null | undefined> = {};
  if (parsed.data.fullName !== undefined) updateData.fullName = parsed.data.fullName;
  if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone;
  if (avatarUrl) {
    // Store avatar on the shop's logoUrl (merchant profile = shop avatar for demo)
    const shop = await prisma.shop.findUnique({ where: { userId: req.userId } });
    if (shop) {
      await prisma.shop.update({ where: { id: shop.id }, data: { logoUrl: avatarUrl } });
    }
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: updateData,
    select: { id: true, email: true, fullName: true, phone: true, createdAt: true },
  });

  return ok(res, { user, avatarUrl });
});

// POST /v1/account/change-password
router.post('/change-password', validate(ChangePasswordSchema), async (req, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user || !user.passwordHash) return fail(res, 404, 'USER_NOT_FOUND', 'User not found');

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return fail(res, 401, 'WRONG_PASSWORD', 'Current password is incorrect');

  const newHash = await bcrypt.hash(newPassword, 12);

  // Revoke all other sessions (keep current)
  await prisma.$transaction([
    prisma.user.update({ where: { id: req.userId! }, data: { passwordHash: newHash } }),
    prisma.session.updateMany({
      where: { userId: req.userId!, revokedAt: null, NOT: { jti: req.jti! } },
      data: { revokedAt: new Date() },
    }),
  ]);

  return ok(res, { message: 'Password updated. All other sessions have been signed out.' });
});

// GET /v1/account/sessions
router.get('/sessions', async (req, res) => {
  const sessions = await prisma.session.findMany({
    where: { userId: req.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, jti: true, ipAddress: true, userAgent: true, createdAt: true, expiresAt: true,
    },
  });

  const withCurrent = sessions.map(s => ({ ...s, isCurrent: s.jti === req.jti }));
  return ok(res, { sessions: withCurrent });
});

// DELETE /v1/account/sessions/:id
router.delete('/sessions/:id', async (req, res) => {
  const session = await prisma.session.findFirst({
    where: { id: req.params.id, userId: req.userId, revokedAt: null },
  });
  if (!session) return fail(res, 404, 'SESSION_NOT_FOUND', 'Session not found');

  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  return ok(res, { message: 'Session revoked' });
});

// DELETE /v1/account/sessions (revoke all others)
router.delete('/sessions', async (req, res) => {
  await prisma.session.updateMany({
    where: { userId: req.userId!, revokedAt: null, NOT: { jti: req.jti! } },
    data: { revokedAt: new Date() },
  });
  return ok(res, { message: 'All other sessions have been signed out.' });
});

export default router;
