'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/lib/admin-auth-context';
import { api } from '@/lib/api-client';
import AdminShell from '../_components/AdminShell';

interface Category {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  specFieldCount: number;
  productCount: number;
  childCount: number;
  children: Category[];
}

interface Row {
  node: Category;
  depth: number;
  siblings: Category[];
  index: number;
}

const BLANK = { name: '', slug: '', parentId: '', sortOrder: 0 };

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function errMsg(res: unknown, fallback: string): string {
  return (res as { error?: { message?: string } }).error?.message ?? fallback;
}

export default function TaxonomyPage() {
  const { admin, loading } = useAdminAuth();
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [fetching, setFetching] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(BLANK);
  const [slugTouched, setSlugTouched] = useState(false);
  const [createError, setCreateError] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(BLANK);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    if (!loading && !admin) router.replace('/superadmin/login');
  }, [admin, loading, router]);

  const load = useCallback(async () => {
    const res = await api.get<{ categories: Category[] }>('/admin/categories');
    if (res.success) setCategories(res.data.categories);
    setFetching(false);
  }, []);

  useEffect(() => {
    if (!admin) return;
    load();
  }, [admin, load]);

  // Only a top-level category with no spec fields of its own can take children —
  // spec templates belong to leaves, so the API refuses the other combinations.
  const parentOptions = categories.map(c => ({
    id: c.id,
    label: c.specFieldCount > 0 ? `${c.name} — has spec fields` : c.name,
    disabled: c.specFieldCount > 0,
  }));

  const rows: Row[] = [];
  categories.forEach((parent, i) => {
    rows.push({ node: parent, depth: 0, siblings: categories, index: i });
    parent.children.forEach((child, j) =>
      rows.push({ node: child, depth: 1, siblings: parent.children, index: j })
    );
  });

  // `type` matters: these were all rendering as a green success banner, so a
  // failed retire looked like it had worked.
  const flash = (text: string, type: 'success' | 'error' = 'success') => {
    setNotice({ text, type });
    setTimeout(() => setNotice(null), 3500);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setSaving(true);
    const res = await api.post('/admin/categories', {
      name: createForm.name,
      slug: createForm.slug || slugify(createForm.name),
      parentId: createForm.parentId || null,
      sortOrder: Number(createForm.sortOrder) || 0,
    });
    setSaving(false);
    if (res.success) {
      setCreateForm(BLANK);
      setSlugTouched(false);
      setShowCreate(false);
      flash(`Created "${createForm.name}"`);
      load();
    } else {
      setCreateError(errMsg(res, 'Could not create the category'));
    }
  };

  const startEdit = (node: Category) => {
    setEditError('');
    setEditingId(node.id);
    setEditForm({
      name: node.name,
      slug: node.slug,
      parentId: node.parentId ?? '',
      sortOrder: node.sortOrder,
    });
  };

  const handleEdit = async (e: React.FormEvent, node: Category) => {
    e.preventDefault();
    setEditError('');
    setSaving(true);
    const res = await api.patch(`/admin/categories/${node.id}`, {
      name: editForm.name,
      slug: editForm.slug,
      parentId: editForm.parentId || null,
      sortOrder: Number(editForm.sortOrder) || 0,
    });
    setSaving(false);
    if (res.success) {
      setEditingId(null);
      flash('Category updated');
      load();
    } else {
      setEditError(errMsg(res, 'Could not update the category'));
    }
  };

  const handleRetire = async (node: Category) => {
    const affected: string[] = [];
    if (node.productCount > 0) {
      affected.push(`${node.productCount} product${node.productCount === 1 ? '' : 's'} tagged to it`);
    }
    if (node.childCount > 0) {
      affected.push(`${node.childCount} sub-categor${node.childCount === 1 ? 'y' : 'ies'}`);
    }

    const warning =
      `Retire "${node.name}"?\n\n` +
      `It will stop appearing in the public taxonomy` +
      (affected.length ? `, along with ${affected.join(' and ')}.` : '.') +
      `\n\nNothing is deleted — products keep their category and any spec values are preserved. ` +
      `You can restore it at any time.`;

    if (!window.confirm(warning)) return;

    setBusyId(node.id);
    const res = await api.delete(`/admin/categories/${node.id}`);
    setBusyId(null);
    if (res.success) {
      flash(`"${node.name}" retired`);
      load();
    } else {
      flash(errMsg(res, 'Could not retire the category'), 'error');
    }
  };

  const handleRestore = async (node: Category) => {
    setBusyId(node.id);
    const res = await api.patch(`/admin/categories/${node.id}`, { isActive: true });
    setBusyId(null);
    if (res.success) {
      flash(`"${node.name}" restored`);
      load();
    } else {
      flash(errMsg(res, 'Could not restore the category'), 'error');
    }
  };

  // Rewrites sortOrder across the sibling group so the list is always a clean
  // 0..n-1 sequence — self-healing when rows share an order (e.g. two created
  // back to back, both defaulting to 0, where a plain swap would do nothing).
  const move = async (row: Row, direction: -1 | 1) => {
    const target = row.index + direction;
    if (target < 0 || target >= row.siblings.length) return;

    const next = [...row.siblings];
    const [moved] = next.splice(row.index, 1);
    next.splice(target, 0, moved);

    setBusyId(row.node.id);
    const results = await Promise.all(
      next
        .map((s, i) => ({ s, i }))
        .filter(({ s, i }) => s.sortOrder !== i)
        .map(({ s, i }) => api.patch(`/admin/categories/${s.id}`, { sortOrder: i }))
    );
    setBusyId(null);

    // A partially applied reorder used to revert silently on reload, leaving the
    // admin to wonder why their click did nothing.
    const failed = results.find(r => !r.success);
    if (failed) flash(errMsg(failed, 'Could not reorder'), 'error');
    load();
  };

  if (loading || !admin) return <div className="dashboard-loading">Loading…</div>;

  return (
    <AdminShell>
      <div className="sa-page">
        <div className="sa-page-header">
          <h1 className="sa-page-title">Taxonomy</h1>
          <button className="btn btn-sm btn-primary" onClick={() => setShowCreate(v => !v)}>
            {showCreate ? 'Cancel' : '+ New Category'}
          </button>
        </div>

        <p className="sa-muted" style={{ fontSize: '0.8125rem', marginBottom: '1rem' }}>
          The shared marketplace vocabulary. Two levels deep — a top-level category holds
          sub-categories, and spec templates attach to the sub-categories (leaves) that products are
          tagged with. Retiring hides a category everywhere without deleting anything.
        </p>

        {notice && (
          <div className={`alert alert-${notice.type}`} style={{ marginBottom: '1rem' }}>
            {notice.text}
          </div>
        )}

        {showCreate && (
          <div className="sa-card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '1rem' }}>New Category</h2>
            {createError && <div className="alert alert-error">{createError}</div>}
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                  <label>Name</label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={e => {
                      const name = e.target.value;
                      setCreateForm(f => ({
                        ...f,
                        name,
                        slug: slugTouched ? f.slug : slugify(name),
                      }));
                    }}
                    required
                    maxLength={100}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                  <label>Slug</label>
                  <input
                    type="text"
                    value={createForm.slug}
                    onChange={e => {
                      setSlugTouched(true);
                      setCreateForm(f => ({ ...f, slug: e.target.value }));
                    }}
                    required
                    maxLength={60}
                  />
                  <div className="field-hint">Lowercase, hyphenated. Must be unique across the whole taxonomy.</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                  <label>Parent</label>
                  <select
                    className="select"
                    value={createForm.parentId}
                    onChange={e => setCreateForm(f => ({ ...f, parentId: e.target.value }))}
                  >
                    <option value="">— Top level —</option>
                    {parentOptions.map(p => (
                      <option key={p.id} value={p.id} disabled={p.disabled}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0, width: 120 }}>
                  <label>Order</label>
                  <input
                    type="number"
                    min={0}
                    value={createForm.sortOrder}
                    onChange={e => setCreateForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="submit" className="btn btn-sm btn-primary" disabled={saving}>
                  {saving ? 'Creating…' : 'Create Category'}
                </button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="sa-table-wrap">
          {fetching ? (
            <div className="sa-loading">Loading taxonomy…</div>
          ) : rows.length === 0 ? (
            <div className="sa-empty">No categories yet. Create the first one above.</div>
          ) : (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Fields</th>
                  <th>Products</th>
                  <th>Order</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const { node, depth, index, siblings } = row;
                  const isLeaf = node.childCount === 0;
                  const busy = busyId === node.id;
                  return (
                    <Fragment key={node.id}>
                      <tr style={{ opacity: node.isActive ? 1 : 0.55 }}>
                        <td style={{ paddingLeft: depth ? '2.25rem' : undefined }}>
                          <div style={{ fontWeight: depth ? 400 : 600 }}>
                            {depth > 0 && <span className="sa-muted" style={{ marginRight: '0.4rem' }}>└</span>}
                            {node.name}
                          </div>
                          <div className="sa-muted" style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                            {node.slug}
                          </div>
                        </td>
                        <td className="sa-muted" style={{ fontSize: '0.8125rem' }}>
                          {depth === 0 ? 'Top level' : 'Leaf'}
                        </td>
                        <td>
                          {isLeaf ? (
                            <Link href={`/superadmin/taxonomy/${node.id}`} className="btn-link">
                              {node.specFieldCount} field{node.specFieldCount === 1 ? '' : 's'} →
                            </Link>
                          ) : (
                            <span className="sa-muted" title="Spec templates attach to leaf categories only">—</span>
                          )}
                        </td>
                        <td className="sa-muted">{node.productCount}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <button
                              className="btn btn-sm btn-secondary"
                              style={{ padding: '0.1rem 0.4rem', lineHeight: 1 }}
                              disabled={busy || index === 0}
                              onClick={() => move(row, -1)}
                              title="Move up"
                            >
                              ↑
                            </button>
                            <button
                              className="btn btn-sm btn-secondary"
                              style={{ padding: '0.1rem 0.4rem', lineHeight: 1 }}
                              disabled={busy || index === siblings.length - 1}
                              onClick={() => move(row, 1)}
                              title="Move down"
                            >
                              ↓
                            </button>
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              padding: '0.15rem 0.4rem',
                              borderRadius: 999,
                              background: node.isActive ? 'var(--color-success-bg)' : '#f3f4f6',
                              color: node.isActive ? 'var(--color-success)' : 'var(--color-muted)',
                            }}
                          >
                            {node.isActive ? 'Active' : 'Retired'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => (editingId === node.id ? setEditingId(null) : startEdit(node))}
                            >
                              {editingId === node.id ? 'Close' : 'Edit'}
                            </button>
                            {node.isActive ? (
                              <button
                                className="btn btn-sm btn-danger-outline"
                                disabled={busy}
                                onClick={() => handleRetire(node)}
                              >
                                {busy ? '…' : 'Retire'}
                              </button>
                            ) : (
                              <button
                                className="btn btn-sm btn-secondary"
                                disabled={busy}
                                onClick={() => handleRestore(node)}
                              >
                                {busy ? '…' : 'Restore'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {editingId === node.id && (
                        <tr>
                          <td colSpan={7} style={{ background: 'var(--color-bg-subtle, #fafafa)' }}>
                            {editError && <div className="alert alert-error">{editError}</div>}
                            <form
                              onSubmit={e => handleEdit(e, node)}
                              style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end', padding: '0.5rem 0' }}
                            >
                              <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
                                <label>Name</label>
                                <input
                                  type="text"
                                  value={editForm.name}
                                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                  required
                                  maxLength={100}
                                />
                              </div>
                              <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
                                <label>Slug</label>
                                <input
                                  type="text"
                                  value={editForm.slug}
                                  onChange={e => setEditForm(f => ({ ...f, slug: e.target.value }))}
                                  required
                                  maxLength={60}
                                />
                                <div className="field-hint">Changing this breaks existing links that use the old slug.</div>
                              </div>
                              <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
                                <label>Parent</label>
                                <select
                                  className="select"
                                  value={editForm.parentId}
                                  onChange={e => setEditForm(f => ({ ...f, parentId: e.target.value }))}
                                >
                                  <option value="">— Top level —</option>
                                  {parentOptions
                                    .filter(p => p.id !== node.id)
                                    .map(p => (
                                      <option key={p.id} value={p.id} disabled={p.disabled}>{p.label}</option>
                                    ))}
                                </select>
                              </div>
                              <div className="field" style={{ marginBottom: 0, width: 100 }}>
                                <label>Order</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={editForm.sortOrder}
                                  onChange={e => setEditForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
                                />
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem', paddingBottom: '0.1rem' }}>
                                <button type="submit" className="btn btn-sm btn-primary" disabled={saving}>
                                  {saving ? 'Saving…' : 'Save'}
                                </button>
                                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditingId(null)}>
                                  Cancel
                                </button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
