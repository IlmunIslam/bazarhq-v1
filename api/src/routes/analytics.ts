import { Router } from 'express';
import { requireMerchant } from '../middleware/auth';

const router = Router();

router.use(requireMerchant);

// GET /v1/analytics/overview
router.get('/overview', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// GET /v1/analytics/top-products
router.get('/top-products', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// GET /v1/analytics/export
router.get('/export', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

export default router;
