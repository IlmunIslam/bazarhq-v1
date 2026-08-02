import dotenv from 'dotenv';
import path from 'path';

// In production (Render) every env var is injected directly into process.env via
// the dashboard — there is no .env file on disk. Only load a local .env during
// development, and never override values already present in process.env.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.join(__dirname, '../.env'), override: false });
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth';
import shopsRoutes from './routes/shops';
import productsRoutes from './routes/products';
import ordersRoutes from './routes/orders';
import analyticsRoutes from './routes/analytics';
import paymentsRoutes from './routes/payments';
import accountRoutes from './routes/account';
import storefrontRoutes from './routes/storefront';
import customerRoutes from './routes/customer';
import adminRoutes from './routes/admin';
import marketplaceRoutes from './routes/marketplace';
import categoryRoutes from './routes/categories';

// Fail fast on a missing or malformed database connection string. Without this,
// Prisma only surfaces the problem on the first query — as a process crash and an
// opaque HTTP 502 — long after startup logs say the service is "live".
function assertValidPostgresUrl(name: string, value: string | undefined, required: boolean): void {
  if (!value) {
    if (required) {
      throw new Error(
        `${name} is not set. In production it must be supplied via the host environment (e.g. the Render dashboard).`
      );
    }
    return;
  }
  // A well-formed connection URL has exactly one "@" separating the credentials
  // from the host. A literal "@" in the password (common in generated passwords)
  // must be percent-encoded as %40 — otherwise the URL parser mis-splits the
  // host/user and Supabase/Postgres reports "Tenant or user not found".
  const afterScheme = value.split('://')[1] ?? '';
  if ((afterScheme.match(/@/g)?.length ?? 0) > 1) {
    throw new Error(
      `${name} contains an unencoded "@" in the password. Percent-encode it as %40 (e.g. "p@ss" → "p%40ss").`
    );
  }
}

assertValidPostgresUrl('DATABASE_URL', process.env.DATABASE_URL, true);
assertValidPostgresUrl('DIRECT_URL', process.env.DIRECT_URL, false);

const app = express();
const PORT = process.env.PORT ?? 3001;

// Static allowlist: localhost (dev), the Vercel production frontend, plus any
// comma-separated origins provided via FRONTEND_URL.
const allowedOrigins = new Set(
  [
    'http://localhost:3000',
    'https://bazarhq-v1-frontend.vercel.app',
    ...(process.env.FRONTEND_URL ?? '').split(',').map((o) => o.trim()),
  ].filter(Boolean)
);

// Storefronts and the admin/superadmin panels are served from *.bazarhq.com
// (and the bare apex), so allow any bazarhq.com subdomain dynamically.
const bazarhqHost = /^https:\/\/([a-z0-9-]+\.)*bazarhq\.com$/i;

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    // Non-browser clients (curl, server-to-server, health checks) send no Origin.
    if (!origin || allowedOrigins.has(origin) || bazarhqHost.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
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
app.use('/v1/payment-configs', paymentsRoutes);
app.use('/v1/account', accountRoutes);
app.use('/v1/storefront', storefrontRoutes);
app.use('/v1/customer', customerRoutes);
app.use('/v1/admin', adminRoutes);
app.use('/v1/marketplace', marketplaceRoutes);
// Sprint C0 — read-only global taxonomy + spec templates. New mount point; no
// existing route's path or behaviour changes.
app.use('/v1/categories', categoryRoutes);

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
