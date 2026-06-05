'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';

// ─── Shop creation ────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(2, 'Store name must be at least 2 characters').max(60),
  subdomain: z
    .string()
    .min(3, 'Must be at least 3 characters')
    .max(30, 'Must be at most 30 characters')
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Lowercase letters, numbers, hyphens only — cannot start or end with a hyphen'),
  description: z.string().max(500).optional(),
});

type CreateFormData = z.infer<typeof createSchema>;

type SubdomainStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

function CreateShopForm() {
  const { refresh } = useAuth();
  const [serverError, setServerError] = useState('');
  const [subdomainStatus, setSubdomainStatus] = useState<SubdomainStatus>('idle');
  const [subdomainMessage, setSubdomainMessage] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateFormData>({ resolver: zodResolver(createSchema) });

  const shopName = watch('name');

  // Auto-suggest subdomain from shop name
  useEffect(() => {
    if (!shopName) return;
    const suggested = shopName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30);
    if (suggested.length >= 3) setValue('subdomain', suggested, { shouldValidate: false });
  }, [shopName, setValue]);

  const checkSubdomain = useCallback(async (value: string) => {
    if (value.length < 3) return;
    setSubdomainStatus('checking');
    const res = await api.get<{ available: boolean; message: string }>(
      `/shops/check-subdomain?subdomain=${value}`
    );
    if (res.success) {
      setSubdomainStatus(res.data.available ? 'available' : 'taken');
      setSubdomainMessage(res.data.message);
    }
  }, []);

  const handleSubdomainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setValue('subdomain', raw, { shouldValidate: true });
    setSubdomainStatus('idle');
    clearTimeout(debounceRef.current);
    if (raw.length >= 3) {
      setSubdomainStatus('checking');
      debounceRef.current = setTimeout(() => checkSubdomain(raw), 500);
    }
  };

  const onSubmit = async (data: CreateFormData) => {
    if (subdomainStatus === 'taken') return;
    setServerError('');
    const res = await api.post<{ shop: { id: string } }>('/shops', data);
    if (res.success) {
      await refresh();
    } else {
      setServerError(res.error.message);
    }
  };

  const subdomainValue = watch('subdomain') ?? '';

  return (
    <div className="setup-container">
      <div className="setup-card">
        <h1>Create your store</h1>
        <p className="subtitle">You're one step away from selling online.</p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="field">
            <label>Store Name</label>
            <input
              {...register('name')}
              placeholder="e.g. Dhaka Crafts"
              className={errors.name ? 'error' : ''}
              autoFocus
            />
            {errors.name && <span className="field-error">{errors.name.message}</span>}
          </div>

          <div className="field">
            <label>Subdomain</label>
            <div className="subdomain-input-wrap">
              <input
                value={subdomainValue}
                onChange={handleSubdomainChange}
                placeholder="your-store"
                className={errors.subdomain || subdomainStatus === 'taken' ? 'error' : ''}
              />
              <span className="subdomain-suffix">.bazarhq.com</span>
            </div>
            {errors.subdomain && <span className="field-error">{errors.subdomain.message}</span>}
            {!errors.subdomain && subdomainStatus === 'checking' && (
              <span className="field-hint">Checking availability…</span>
            )}
            {!errors.subdomain && subdomainStatus === 'available' && (
              <span className="field-hint success">✓ {subdomainMessage}</span>
            )}
            {!errors.subdomain && subdomainStatus === 'taken' && (
              <span className="field-error">{subdomainMessage}</span>
            )}
          </div>

          <div className="field">
            <label>Description <span className="optional">(optional)</span></label>
            <input {...register('description')} placeholder="What do you sell?" />
          </div>

          {serverError && <div className="alert alert-error">{serverError}</div>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || subdomainStatus === 'taken' || subdomainStatus === 'checking'}
          >
            {isSubmitting ? 'Creating store…' : 'Create Store'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Dashboard home ───────────────────────────────────────────────────────────

interface ShopDetail {
  id: string;
  subdomain: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  status: string;
  publishedAt: string | null;
  _count: { products: number; orders: number };
}

function DashboardHome() {
  const { user, shop: authShop, refresh } = useAuth();
  const [shop, setShop] = useState<ShopDetail | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');

  useEffect(() => {
    api.get<{ shop: ShopDetail }>('/shops/me').then((res) => {
      if (res.success) setShop(res.data.shop);
    });
  }, [authShop]);

  const handlePublish = async () => {
    setPublishing(true);
    setPublishError('');
    const res = await api.post<{ shop: ShopDetail }>('/shops/me/publish', {});
    if (res.success) {
      setShop(res.data.shop);
      await refresh();
    } else {
      setPublishError(res.error.message);
    }
    setPublishing(false);
  };

  if (!shop) return <div className="dashboard-loading">Loading…</div>;

  const isPublished = shop.status === 'published';

  const checklist = [
    { label: 'Create account', done: true },
    { label: 'Create store', done: true },
    { label: 'Upload logo', done: !!shop.logoUrl, todo: '/dashboard/settings' },
    { label: 'Add first product', done: shop._count.products > 0, todo: '/dashboard/products' },
    { label: 'Publish store', done: isPublished },
  ];

  const completedSteps = checklist.filter((c) => c.done).length;
  const progress = Math.round((completedSteps / checklist.length) * 100);

  return (
    <div>
      <div className="dashboard-welcome">
        <h1>Welcome, {user?.fullName?.split(' ')[0]}!</h1>
        <p className="subtitle">
          Your store:{' '}
          <a href={`http://${shop.subdomain}.bazarhq.com`} target="_blank" rel="noopener noreferrer">
            {shop.subdomain}.bazarhq.com ↗
          </a>
          {' '}
          <span className={`status-badge status-${shop.status}`}>{shop.status}</span>
        </p>
      </div>

      <div className="dashboard-grid">
        {/* Stats */}
        <div className="stat-card">
          <span className="stat-value">{shop._count.products}</span>
          <span className="stat-label">Active Products</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{shop._count.orders}</span>
          <span className="stat-label">Total Orders</span>
        </div>

        {/* Onboarding checklist */}
        {!isPublished && (
          <div className="checklist-card">
            <div className="checklist-header">
              <h2>Set up your store</h2>
              <span className="checklist-progress">{completedSteps}/{checklist.length} done</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <ul className="checklist">
              {checklist.map((item) => (
                <li key={item.label} className={`checklist-item ${item.done ? 'done' : ''}`}>
                  <span className="check-icon">{item.done ? '✓' : '○'}</span>
                  {item.todo && !item.done ? (
                    <a href={item.todo}>{item.label}</a>
                  ) : (
                    <span>{item.label}</span>
                  )}
                </li>
              ))}
            </ul>
            {publishError && <div className="alert alert-error" style={{ marginTop: '1rem' }}>{publishError}</div>}
            <button
              onClick={handlePublish}
              className="btn btn-primary"
              style={{ marginTop: '1rem' }}
              disabled={publishing}
            >
              {publishing ? 'Publishing…' : 'Publish Store'}
            </button>
          </div>
        )}

        {isPublished && (
          <div className="checklist-card">
            <div className="alert alert-success">
              🎉 Your store is live at{' '}
              <a href={`http://${shop.subdomain}.bazarhq.com`} target="_blank" rel="noopener noreferrer">
                {shop.subdomain}.bazarhq.com
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page entry point ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { shop, loading } = useAuth();
  if (loading) return null;
  return shop ? <DashboardHome /> : <CreateShopForm />;
}
