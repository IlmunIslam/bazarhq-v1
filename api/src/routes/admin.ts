import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import { publicRateLimit } from '../middleware/rate-limiter';

const router = Router();

// POST /v1/admin/auth/login  (step 1: email + password)
router.post('/auth/login', publicRateLimit, async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// POST /v1/admin/auth/verify-totp  (step 2: TOTP)
router.post('/auth/verify-totp', publicRateLimit, async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// All routes below require admin auth
router.use(requireAdmin);

// GET /v1/admin/merchants
router.get('/merchants', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// PATCH /v1/admin/merchants/:id
router.patch('/merchants/:id', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// GET /v1/admin/analytics/overview
router.get('/analytics/overview', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// GET /v1/admin/audit-logs
router.get('/audit-logs', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// GET /v1/admin/system/health
router.get('/system/health', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// POST /v1/admin/announcements
router.post('/announcements', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

export default router;
