import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth';
import shopsRoutes from './routes/shops';
import productsRoutes from './routes/products';
import ordersRoutes from './routes/orders';
import analyticsRoutes from './routes/analytics';
import storefrontRoutes from './routes/storefront';
import customerRoutes from './routes/customer';
import adminRoutes from './routes/admin';

const app = express();
const PORT = process.env.PORT ?? 3001;

const corsOptions = {
  origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/v1/auth', authRoutes);
app.use('/v1/shops', shopsRoutes);
app.use('/v1/products', productsRoutes);
app.use('/v1/orders', ordersRoutes);
app.use('/v1/analytics', analyticsRoutes);
app.use('/v1/storefront', storefrontRoutes);
app.use('/v1/customer', customerRoutes);
app.use('/v1/admin', adminRoutes);

// Global error handler — catches multer/busboy errors and any unhandled next(err)
app.use((err: Error & { code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'File exceeds 5 MB limit' } });
  }
  console.error('[unhandled error]', err.message);
  return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
