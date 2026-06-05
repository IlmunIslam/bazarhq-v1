import { Router } from 'express';
import { publicRateLimit } from '../middleware/rate-limiter';

const router = Router();

// GET /v1/storefront/:subdomain
router.get('/:subdomain', publicRateLimit, async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// GET /v1/storefront/:subdomain/products
router.get('/:subdomain/products', publicRateLimit, async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

// GET /v1/storefront/:subdomain/products/:slug
router.get('/:subdomain/products/:slug', publicRateLimit, async (_req, res) => { res.status(501).json({ message: 'TODO' }); });

export default router;
