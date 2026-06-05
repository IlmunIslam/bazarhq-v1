import { Router } from 'express';
import { requireMerchant } from '../middleware/auth';
import { publicRateLimit } from '../middleware/rate-limiter';

const router = Router();

// Public: guest order placement
// POST /v1/orders/guest
router.post('/guest', publicRateLimit, async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// Public: order tracking by ID + phone
// GET /v1/orders/track?id=xxx&phone=xxx
router.get('/track', publicRateLimit, async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// Merchant routes
// GET /v1/orders
router.get('/', requireMerchant, async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// GET /v1/orders/:id
router.get('/:id', requireMerchant, async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// PATCH /v1/orders/:id/status
router.patch('/:id/status', requireMerchant, async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

export default router;
