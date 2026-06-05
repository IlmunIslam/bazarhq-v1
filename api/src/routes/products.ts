import { Router } from 'express';
import { requireMerchant } from '../middleware/auth';

const router = Router();

// All product routes require merchant auth
router.use(requireMerchant);

// GET /v1/products
router.get('/', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// POST /v1/products
router.post('/', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// GET /v1/products/:id
router.get('/:id', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// PATCH /v1/products/:id
router.patch('/:id', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// DELETE /v1/products/:id
router.delete('/:id', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// POST /v1/products/:id/duplicate
router.post('/:id/duplicate', async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

export default router;
