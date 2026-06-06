'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';

interface ProductImage { url: string; }
interface Category { id: string; name: string; }
interface Product {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'archived';
  basePrice: string;
  compareAtPrice: string | null;
  stock: number;
  category: Category | null;
  images: ProductImage[];
  _count: { variants: number; orderItems: number };
}

type StatusFilter = 'all' | 'active' | 'draft' | 'archived';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
];

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (search) params.set('search', search);
    const res = await api.get<{ products: Product[] }>(`/products?${params}`);
    if (res.success) setProducts(res.data.products);
    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleDuplicate = async (id: string) => {
    const res = await api.post<{ product: Product }>(`/products/${id}/duplicate`, {});
    if (res.success) {
      router.push(`/dashboard/products/${res.data.product.id}/edit`);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    setError('');
    const res = await api.delete<{ deleted: boolean }>(`/products/${id}`);
    if (res.success) {
      setProducts(p => p.filter(x => x.id !== id));
    } else {
      setError(res.error.message);
    }
    setDeleting(null);
  };

  const handleArchive = async (id: string) => {
    const res = await api.patch<{ product: Product }>(`/products/${id}`, { status: 'archived' });
    if (res.success) setProducts(p => p.map(x => x.id === id ? { ...x, status: 'archived' } : x));
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Products</h1>
          <p className="page-subtitle">{products.length} product{products.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/dashboard/products/new" className="btn btn-primary btn-sm">
          + Add product
        </Link>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="card">
        <div className="table-toolbar">
          <div className="status-tabs">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.value}
                className={`status-tab ${statusFilter === tab.value ? 'active' : ''}`}
                onClick={() => setStatusFilter(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <input
            className="search-input"
            placeholder="Search products…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="table-empty">Loading…</div>
        ) : products.length === 0 ? (
          <div className="table-empty">
            {search || statusFilter !== 'all'
              ? 'No products match your filters.'
              : 'No products yet. '}
            {!search && statusFilter === 'all' && (
              <Link href="/dashboard/products/new">Add your first product →</Link>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Status</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td>
                    <div className="product-cell">
                      {p.images[0] ? (
                        <img src={p.images[0].url} alt={p.name} className="product-thumb" />
                      ) : (
                        <div className="product-thumb product-thumb-empty">?</div>
                      )}
                      <div>
                        <div className="product-name">{p.name}</div>
                        {p._count.variants > 0 && (
                          <div className="product-meta">{p._count.variants} variant{p._count.variants !== 1 ? 's' : ''}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`status-badge status-${p.status}`}>{p.status}</span>
                  </td>
                  <td className="text-muted">{p.category?.name ?? '—'}</td>
                  <td>
                    <div>৳{Number(p.basePrice).toFixed(2)}</div>
                    {p.compareAtPrice && (
                      <div className="price-compare">৳{Number(p.compareAtPrice).toFixed(2)}</div>
                    )}
                  </td>
                  <td className={p.stock === 0 && p._count.variants === 0 ? 'text-error' : ''}>
                    {p._count.variants > 0 ? '—' : p.stock}
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link href={`/dashboard/products/${p.id}/edit`} className="action-btn">
                        Edit
                      </Link>
                      <button className="action-btn" onClick={() => handleDuplicate(p.id)}>
                        Duplicate
                      </button>
                      {p._count.orderItems > 0 ? (
                        <button className="action-btn" onClick={() => handleArchive(p.id)}
                          disabled={p.status === 'archived'}>
                          Archive
                        </button>
                      ) : (
                        <button
                          className="action-btn action-btn-danger"
                          onClick={() => handleDelete(p.id, p.name)}
                          disabled={deleting === p.id}
                        >
                          {deleting === p.id ? '…' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
