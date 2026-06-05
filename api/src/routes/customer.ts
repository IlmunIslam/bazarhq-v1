import { Router } from 'express';
import { publicRateLimit } from '../middleware/rate-limiter';

const router = Router();

// POST /v1/customer/auth/register
router.post('/auth/register', publicRateLimit, async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// POST /v1/customer/auth/login
router.post('/auth/login', publicRateLimit, async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// GET /v1/customer/orders
router.get('/orders', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// GET/POST/PATCH/DELETE /v1/customer/addresses
router.get('/addresses', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });
router.post('/addresses', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });
router.patch('/addresses/:id', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });
router.delete('/addresses/:id', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

export default router;
