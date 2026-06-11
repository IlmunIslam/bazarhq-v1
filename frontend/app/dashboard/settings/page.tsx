'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';

interface PaymentConfig {
  id: string;
  method: 'cod' | 'bkash' | 'nagad';
  isEnabled: boolean;
  credentials: { accountNumber?: string } | null;
}

interface ShopDetail {
  id: string;
  subdomain: string;
  name: string;
  status: string;
}

const METHOD_LABELS: Record<string, string> = {
  cod: 'Cash on Delivery (COD)',
  bkash: 'bKash',
  nagad: 'Nagad',
};
const METHOD_DESCRIPTIONS: Record<string, string> = {
  cod: 'Collect payment when the order is delivered. No credentials needed.',
  bkash: 'Customers pay via bKash and submit their Transaction ID.',
  nagad: 'Customers pay via Nagad and submit their Transaction ID.',
};
const METHODS = ['cod', 'bkash', 'nagad'] as const;

export default function SettingsPage() {
  const { user } = useAuth();
  const [shop, setShop] = useState<ShopDetail | null>(null);
  const [configs, setConfigs] = useState<PaymentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [accountInputs, setAccountInputs] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, { type: 'success' | 'error'; text: string }>>({});
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ shop: ShopDetail }>('/shops/me'),
      api.get<{ configs: PaymentConfig[] }>('/payment-configs'),
    ]).then(([shopRes, cfgRes]) => {
      if (shopRes.success) setShop(shopRes.data.shop);
      if (cfgRes.success) setConfigs(cfgRes.data.configs);
      setLoading(false);
    });
  }, []);

  const getConfig = (method: string) =>
    configs.find(c => c.method === method) ?? { method, isEnabled: false, credentials: null } as PaymentConfig;

  const setMessage = (method: string, type: 'success' | 'error', text: string) => {
    setMessages(prev => ({ ...prev, [method]: { type, text } }));
    setTimeout(() => setMessages(prev => { const n = { ...prev }; delete n[method]; return n; }), 3000);
  };

  const handleToggle = async (method: typeof METHODS[number], currentEnabled: boolean) => {
    const newEnabled = !currentEnabled;
    setSaving(prev => ({ ...prev, [method]: true }));

    const body: { isEnabled: boolean; credentials?: { accountNumber: string } } = { isEnabled: newEnabled };
    const input = accountInputs[method];
    if (input && method !== 'cod') body.credentials = { accountNumber: input };

    const res = await api.patch<{ config: PaymentConfig }>(`/payment-configs/${method}`, body);
    if (res.success) {
      setConfigs(prev => {
        const next = prev.filter(c => c.method !== method);
        return [...next, res.data.config];
      });
      setMessage(method, 'success', newEnabled ? 'Enabled' : 'Disabled');
    } else {
      setMessage(method, 'error', res.error?.message ?? 'Failed to update');
    }
    setSaving(prev => ({ ...prev, [method]: false }));
  };

  const handleSaveCredentials = async (method: typeof METHODS[number]) => {
    const accountNumber = accountInputs[method]?.trim();
    if (!accountNumber) {
      setMessage(method, 'error', 'Account number is required');
      return;
    }
    setSaving(prev => ({ ...prev, [method]: true }));
    const cfg = getConfig(method);
    const res = await api.patch<{ config: PaymentConfig }>(`/payment-configs/${method}`, {
      isEnabled: cfg.isEnabled,
      credentials: { accountNumber },
    });
    if (res.success) {
      setConfigs(prev => {
        const next = prev.filter(c => c.method !== method);
        return [...next, res.data.config];
      });
      setAccountInputs(prev => ({ ...prev, [method]: '' }));
      setMessage(method, 'success', 'Credentials saved');
    } else {
      setMessage(method, 'error', res.error?.message ?? 'Failed to save credentials');
    }
    setSaving(prev => ({ ...prev, [method]: false }));
  };

  const handlePublish = async () => {
    setPublishing(true);
    setPublishMsg(null);
    const res = await api.post<{ shop: ShopDetail }>('/shops/me/publish', {});
    if (res.success) {
      setShop(res.data.shop);
      setPublishMsg({ type: 'success', text: `Your store is now live at ${res.data.shop.subdomain}.bazarhq.com` });
    } else {
      setPublishMsg({ type: 'error', text: res.error?.message ?? 'Failed to publish' });
    }
    setPublishing(false);
  };

  if (loading) return <div className="dashboard-loading">Loading settings…</div>;
  if (!user || !shop) return null;

  const enabledCount = configs.filter(c => c.isEnabled).length;

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 600 }}>Settings</h1>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          Configure payment methods and manage your store.
        </p>
      </div>

      {/* Payment Methods */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Payment Methods</h2>

        {enabledCount === 0 && (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
            You must enable at least one payment method before you can publish your store.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {METHODS.map(method => {
            const cfg = getConfig(method);
            const isSaving = saving[method] ?? false;
            const msg = messages[method];
            const isNonCod = method === 'bkash' || method === 'nagad';
            const savedAccount = cfg.credentials?.accountNumber;

            return (
              <div key={method} style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: '1rem 1.25rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.9375rem' }}>{METHOD_LABELS[method]}</div>
                    <div style={{ color: 'var(--color-muted)', fontSize: '0.8125rem', marginTop: '0.2rem' }}>
                      {METHOD_DESCRIPTIONS[method]}
                    </div>
                    {savedAccount && (
                      <div style={{ fontSize: '0.8125rem', marginTop: '0.4rem', color: 'var(--color-muted)' }}>
                        Account: <code style={{ background: '#f3f4f6', padding: '0.1rem 0.3rem', borderRadius: 4 }}>{savedAccount}</code>
                      </div>
                    )}
                  </div>
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(method, cfg.isEnabled)}
                    disabled={isSaving}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      border: 'none',
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      background: cfg.isEnabled ? 'var(--color-primary)' : '#d1d5db',
                      position: 'relative',
                      transition: 'background 0.2s',
                      flexShrink: 0,
                    }}
                    aria-label={`${cfg.isEnabled ? 'Disable' : 'Enable'} ${METHOD_LABELS[method]}`}
                  >
                    <span style={{
                      display: 'block',
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: '#fff',
                      position: 'absolute',
                      top: 3,
                      left: cfg.isEnabled ? 23 : 3,
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                </div>

                {/* Credential input for bKash / Nagad */}
                {isNonCod && cfg.isEnabled && (
                  <div style={{ marginTop: '0.875rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.3rem' }}>
                        {method === 'bkash' ? 'bKash' : 'Nagad'} Account Number
                      </label>
                      <input
                        type="text"
                        placeholder={savedAccount ? `Current: ${savedAccount}` : '01XXXXXXXXX'}
                        value={accountInputs[method] ?? ''}
                        onChange={e => setAccountInputs(prev => ({ ...prev, [method]: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius)',
                          fontSize: '0.875rem',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <button
                      onClick={() => handleSaveCredentials(method)}
                      disabled={isSaving || !accountInputs[method]?.trim()}
                      className="btn btn-primary"
                      style={{ whiteSpace: 'nowrap', padding: '0.5rem 1rem', flexShrink: 0 }}
                    >
                      {isSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                )}

                {msg && (
                  <div style={{
                    marginTop: '0.5rem',
                    fontSize: '0.8125rem',
                    color: msg.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
                  }}>
                    {msg.type === 'success' ? '✓ ' : '✗ '}{msg.text}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Publish Store */}
      <section style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: '1.25rem',
      }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          Store Status
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', marginBottom: '1rem' }}>
          {shop.status === 'published'
            ? `Your store is live at ${shop.subdomain}.bazarhq.com.`
            : 'Publish your store to make it visible to customers.'}
        </p>

        {publishMsg && (
          <div className={`alert alert-${publishMsg.type}`} style={{ marginBottom: '1rem' }}>
            {publishMsg.text}
          </div>
        )}

        {shop.status !== 'published' ? (
          <button
            onClick={handlePublish}
            disabled={publishing || enabledCount === 0}
            className="btn btn-primary"
          >
            {publishing ? 'Publishing…' : 'Publish Store'}
          </button>
        ) : (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            fontSize: '0.875rem',
            color: 'var(--color-success)',
            fontWeight: 500,
          }}>
            <span>●</span> Published
          </span>
        )}
      </section>
    </div>
  );
}
