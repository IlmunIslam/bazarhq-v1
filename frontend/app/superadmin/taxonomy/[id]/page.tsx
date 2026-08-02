'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAdminAuth } from '@/lib/admin-auth-context';
import { api } from '@/lib/api-client';
import AdminShell from '../../_components/AdminShell';

type DataType = 'text' | 'number' | 'boolean' | 'enum';

interface SpecField {
  id: string;
  key: string;
  label: string;
  unit: string | null;
  dataType: DataType;
  options: string[];
  sortOrder: number;
  isComparable: boolean;
  isRequired: boolean;
  isActive: boolean;
  valueCount: number;
}

interface CategoryInfo {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  parent: { id: string; name: string; slug: string } | null;
  childCount: number;
  productCount: number;
}

const DATA_TYPES: { value: DataType; label: string; hint: string }[] = [
  { value: 'text', label: 'Text', hint: 'Free text, e.g. "Samsung" or "Cotton"' },
  { value: 'number', label: 'Number', hint: 'Numeric — comparable and filterable, e.g. 8 GB' },
  { value: 'boolean', label: 'Yes / No', hint: 'A flag, e.g. "Dual SIM"' },
  { value: 'enum', label: 'Choice list', hint: 'One of a fixed set of options you define below' },
];

const BLANK = {
  label: '',
  key: '',
  unit: '',
  dataType: 'text' as DataType,
  optionsText: '',
  isComparable: true,
  isRequired: false,
};

function keyify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+$/g, '')
    .slice(0, 40);
}

function parseOptions(text: string): string[] {
  return text.split('\n').map(o => o.trim()).filter(Boolean);
}

function errMsg(res: unknown, fallback: string): string {
  return (res as { error?: { message?: string } }).error?.message ?? fallback;
}

export default function SpecFieldsPage() {
  const { admin, loading } = useAdminAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const categoryId = params.id;

  const [category, setCategory] = useState<CategoryInfo | null>(null);
  const [fields, setFields] = useState<SpecField[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(BLANK);
  const [keyTouched, setKeyTouched] = useState(false);
  const [createError, setCreateError] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(BLANK);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    if (!loading && !admin) router.replace('/superadmin/login');
  }, [admin, loading, router]);

  const load = useCallback(async () => {
    const res = await api.get<{ category: CategoryInfo; specFields: SpecField[] }>(
      `/admin/categories/${categoryId}/spec-fields`
    );
    if (res.success) {
      setCategory(res.data.category);
      setFields(res.data.specFields);
    } else {
      setLoadError(errMsg(res, 'Could not load this category'));
    }
    setFetching(false);
  }, [categoryId]);

  useEffect(() => {
    if (!admin) return;
    load();
  }, [admin, load]);

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(''), 3500);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');

    const options = parseOptions(createForm.optionsText);
    if (createForm.dataType === 'enum' && options.length === 0) {
      setCreateError('A choice list needs at least one option — one per line.');
      return;
    }

    setSaving(true);
    const res = await api.post(`/admin/categories/${categoryId}/spec-fields`, {
      key: createForm.key || keyify(createForm.label),
      label: createForm.label,
      unit: createForm.unit.trim() || null,
      dataType: createForm.dataType,
      ...(createForm.dataType === 'enum' ? { options } : {}),
      sortOrder: fields.length,
      isComparable: createForm.isComparable,
      isRequired: createForm.isRequired,
    });
    setSaving(false);

    if (res.success) {
      setCreateForm(BLANK);
      setKeyTouched(false);
      setShowCreate(false);
      flash(`Added "${createForm.label}"`);
      load();
    } else {
      setCreateError(errMsg(res, 'Could not add the field'));
    }
  };

  const startEdit = (field: SpecField) => {
    setEditError('');
    setEditingId(field.id);
    setEditForm({
      label: field.label,
      key: field.key,
      unit: field.unit ?? '',
      dataType: field.dataType,
      optionsText: field.options.join('\n'),
      isComparable: field.isComparable,
      isRequired: field.isRequired,
    });
  };

  const handleEdit = async (e: React.FormEvent, field: SpecField) => {
    e.preventDefault();
    setEditError('');

    const options = parseOptions(editForm.optionsText);
    if (editForm.dataType === 'enum' && options.length === 0) {
      setEditError('A choice list needs at least one option — one per line.');
      return;
    }

    setSaving(true);
    // `key` is never sent: it is immutable once the field exists, and the API
    // rejects any request that includes it rather than silently ignoring it.
    const res = await api.patch(`/admin/spec-fields/${field.id}`, {
      label: editForm.label,
      unit: editForm.unit.trim() || null,
      dataType: editForm.dataType,
      ...(editForm.dataType === 'enum' ? { options } : {}),
      isComparable: editForm.isComparable,
      isRequired: editForm.isRequired,
    });
    setSaving(false);

    if (res.success) {
      setEditingId(null);
      flash('Field updated');
      load();
    } else {
      setEditError(errMsg(res, 'Could not update the field'));
    }
  };

  const handleRetire = async (field: SpecField) => {
    const warning =
      `Retire "${field.label}"?\n\n` +
      `It will stop appearing on the merchant product form and in comparisons.` +
      (field.valueCount > 0
        ? `\n\n${field.valueCount} product${field.valueCount === 1 ? '' : 's'} already ` +
          `${field.valueCount === 1 ? 'has a value' : 'have values'} for this field. ` +
          `Those values are preserved, not deleted.`
        : '') +
      `\n\nYou can restore it at any time.`;

    if (!window.confirm(warning)) return;

    setBusyId(field.id);
    const res = await api.delete(`/admin/spec-fields/${field.id}`);
    setBusyId(null);
    if (res.success) {
      flash(`"${field.label}" retired`);
      load();
    } else {
      flash(errMsg(res, 'Could not retire the field'));
    }
  };

  const handleRestore = async (field: SpecField) => {
    setBusyId(field.id);
    const res = await api.patch(`/admin/spec-fields/${field.id}`, { isActive: true });
    setBusyId(null);
    if (res.success) {
      flash(`"${field.label}" restored`);
      load();
    } else {
      flash(errMsg(res, 'Could not restore the field'));
    }
  };

  // Rewrites sortOrder across the whole list so it is always a clean 0..n-1
  // sequence — a plain swap does nothing when two fields share an order.
  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;

    const next = [...fields];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);

    setBusyId(fields[index].id);
    await Promise.all(
      next
        .map((f, i) => ({ f, i }))
        .filter(({ f, i }) => f.sortOrder !== i)
        .map(({ f, i }) => api.patch(`/admin/spec-fields/${f.id}`, { sortOrder: i }))
    );
    setBusyId(null);
    load();
  };

  if (loading || !admin) return <div className="dashboard-loading">Loading…</div>;

  return (
    <AdminShell>
      <div className="sa-page">
        <div style={{ marginBottom: '0.75rem' }}>
          <Link href="/superadmin/taxonomy" className="btn-link" style={{ fontSize: '0.8125rem' }}>
            ← Taxonomy
          </Link>
        </div>

        {fetching ? (
          <div className="sa-loading">Loading spec template…</div>
        ) : loadError || !category ? (
          <div className="alert alert-error">{loadError || 'Category not found'}</div>
        ) : (
          <>
            <div className="sa-page-header">
              <div>
                <h1 className="sa-page-title">
                  {category.parent && (
                    <span className="sa-muted" style={{ fontWeight: 400 }}>{category.parent.name} / </span>
                  )}
                  {category.name}
                </h1>
                <div className="sa-muted" style={{ fontSize: '0.8125rem', marginTop: '0.2rem' }}>
                  <span style={{ fontFamily: 'monospace' }}>{category.slug}</span>
                  {' · '}
                  {category.productCount} product{category.productCount === 1 ? '' : 's'} tagged
                  {!category.isActive && ' · Retired'}
                </div>
              </div>
              {category.childCount === 0 && (
                <button className="btn btn-sm btn-primary" onClick={() => setShowCreate(v => !v)}>
                  {showCreate ? 'Cancel' : '+ Add Field'}
                </button>
              )}
            </div>

            {notice && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{notice}</div>}

            {category.childCount > 0 ? (
              <div className="sa-card" style={{ padding: '1.25rem' }}>
                <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  <strong>{category.name}</strong> has {category.childCount} sub-categor
                  {category.childCount === 1 ? 'y' : 'ies'}, so it does not carry a spec template of
                  its own.
                </p>
                <p className="sa-muted" style={{ fontSize: '0.8125rem' }}>
                  Spec templates attach to leaf categories — the ones merchants actually tag products
                  with. Open a sub-category from the{' '}
                  <Link href="/superadmin/taxonomy" className="btn-link">taxonomy list</Link> to edit
                  its fields.
                </p>
              </div>
            ) : (
              <>
                <p className="sa-muted" style={{ fontSize: '0.8125rem', marginBottom: '1rem' }}>
                  These fields drive the merchant product form and the rows of a product comparison.
                  Order here is the order merchants and shoppers see. Retiring a field preserves every
                  value already entered against it.
                </p>

                {showCreate && (
                  <div className="sa-card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '1rem' }}>New Spec Field</h2>
                    {createError && <div className="alert alert-error">{createError}</div>}
                    <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
                          <label>Label</label>
                          <input
                            type="text"
                            value={createForm.label}
                            onChange={e => {
                              const label = e.target.value;
                              setCreateForm(f => ({ ...f, label, key: keyTouched ? f.key : keyify(label) }));
                            }}
                            required
                            maxLength={80}
                            placeholder="RAM"
                          />
                          <div className="field-hint">What merchants and shoppers see.</div>
                        </div>
                        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
                          <label>Key</label>
                          <input
                            type="text"
                            value={createForm.key}
                            onChange={e => {
                              setKeyTouched(true);
                              setCreateForm(f => ({ ...f, key: e.target.value }));
                            }}
                            required
                            maxLength={40}
                            placeholder="ram_gb"
                            style={{ fontFamily: 'monospace' }}
                          />
                          <div className="field-hint">
                            Permanent — it cannot be changed later. Lowercase, underscores.
                          </div>
                        </div>
                        <div className="field" style={{ marginBottom: 0, width: 120 }}>
                          <label>Unit</label>
                          <input
                            type="text"
                            value={createForm.unit}
                            onChange={e => setCreateForm(f => ({ ...f, unit: e.target.value }))}
                            maxLength={20}
                            placeholder="GB"
                          />
                        </div>
                      </div>

                      <div className="field" style={{ marginBottom: 0, maxWidth: 320 }}>
                        <label>Data type</label>
                        <select
                          className="select"
                          value={createForm.dataType}
                          onChange={e => setCreateForm(f => ({ ...f, dataType: e.target.value as DataType }))}
                        >
                          {DATA_TYPES.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                        <div className="field-hint">
                          {DATA_TYPES.find(t => t.value === createForm.dataType)?.hint}
                        </div>
                      </div>

                      {createForm.dataType === 'enum' && (
                        <div className="field" style={{ marginBottom: 0, maxWidth: 320 }}>
                          <label>Options</label>
                          <textarea
                            className="textarea"
                            rows={4}
                            value={createForm.optionsText}
                            onChange={e => setCreateForm(f => ({ ...f, optionsText: e.target.value }))}
                            placeholder={'3G\n4G\n5G'}
                          />
                          <div className="field-hint">One per line.</div>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
                          <input
                            type="checkbox"
                            checked={createForm.isComparable}
                            onChange={e => setCreateForm(f => ({ ...f, isComparable: e.target.checked }))}
                          />
                          Show as a comparison row
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
                          <input
                            type="checkbox"
                            checked={createForm.isRequired}
                            onChange={e => setCreateForm(f => ({ ...f, isRequired: e.target.checked }))}
                          />
                          Required of merchants
                        </label>
                      </div>

                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button type="submit" className="btn btn-sm btn-primary" disabled={saving}>
                          {saving ? 'Adding…' : 'Add Field'}
                        </button>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowCreate(false)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="sa-table-wrap">
                  {fields.length === 0 ? (
                    <div className="sa-empty">
                      No spec fields yet. Add the first one to give this category a comparison template.
                    </div>
                  ) : (
                    <table className="sa-table">
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Field</th>
                          <th>Type</th>
                          <th>Options</th>
                          <th>Flags</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((field, i) => {
                          const busy = busyId === field.id;
                          return (
                            <Fragment key={field.id}>
                              <tr style={{ opacity: field.isActive ? 1 : 0.55 }}>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <button
                                      className="btn btn-sm btn-secondary"
                                      style={{ padding: '0.1rem 0.4rem', lineHeight: 1 }}
                                      disabled={busy || i === 0}
                                      onClick={() => move(i, -1)}
                                      title="Move up"
                                    >
                                      ↑
                                    </button>
                                    <button
                                      className="btn btn-sm btn-secondary"
                                      style={{ padding: '0.1rem 0.4rem', lineHeight: 1 }}
                                      disabled={busy || i === fields.length - 1}
                                      onClick={() => move(i, 1)}
                                      title="Move down"
                                    >
                                      ↓
                                    </button>
                                  </div>
                                </td>
                                <td>
                                  <div style={{ fontWeight: 500 }}>
                                    {field.label}
                                    {field.unit && <span className="sa-muted"> ({field.unit})</span>}
                                  </div>
                                  <div className="sa-muted" style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                    {field.key}
                                  </div>
                                </td>
                                <td className="sa-muted" style={{ fontSize: '0.8125rem' }}>
                                  {DATA_TYPES.find(t => t.value === field.dataType)?.label ?? field.dataType}
                                  {field.valueCount > 0 && (
                                    <div style={{ fontSize: '0.7rem' }}>{field.valueCount} in use</div>
                                  )}
                                </td>
                                <td className="sa-muted" style={{ fontSize: '0.8125rem', maxWidth: 200 }}>
                                  {field.options.length > 0 ? field.options.join(', ') : '—'}
                                </td>
                                <td className="sa-muted" style={{ fontSize: '0.75rem' }}>
                                  {field.isComparable && <div>Comparable</div>}
                                  {field.isRequired && <div>Required</div>}
                                  {!field.isComparable && !field.isRequired && '—'}
                                </td>
                                <td>
                                  <span
                                    style={{
                                      fontSize: '0.7rem',
                                      fontWeight: 600,
                                      padding: '0.15rem 0.4rem',
                                      borderRadius: 999,
                                      background: field.isActive ? 'var(--color-success-bg)' : '#f3f4f6',
                                      color: field.isActive ? 'var(--color-success)' : 'var(--color-muted)',
                                    }}
                                  >
                                    {field.isActive ? 'Active' : 'Retired'}
                                  </span>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                                    <button
                                      className="btn btn-sm btn-secondary"
                                      onClick={() => (editingId === field.id ? setEditingId(null) : startEdit(field))}
                                    >
                                      {editingId === field.id ? 'Close' : 'Edit'}
                                    </button>
                                    {field.isActive ? (
                                      <button
                                        className="btn btn-sm btn-danger-outline"
                                        disabled={busy}
                                        onClick={() => handleRetire(field)}
                                      >
                                        {busy ? '…' : 'Retire'}
                                      </button>
                                    ) : (
                                      <button
                                        className="btn btn-sm btn-secondary"
                                        disabled={busy}
                                        onClick={() => handleRestore(field)}
                                      >
                                        {busy ? '…' : 'Restore'}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>

                              {editingId === field.id && (
                                <tr>
                                  <td colSpan={7} style={{ background: 'var(--color-bg-subtle, #fafafa)' }}>
                                    {editError && <div className="alert alert-error">{editError}</div>}
                                    <form
                                      onSubmit={e => handleEdit(e, field)}
                                      style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', padding: '0.5rem 0' }}
                                    >
                                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
                                          <label>Label</label>
                                          <input
                                            type="text"
                                            value={editForm.label}
                                            onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                                            required
                                            maxLength={80}
                                          />
                                        </div>
                                        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
                                          <label>Key</label>
                                          <input
                                            type="text"
                                            value={editForm.key}
                                            disabled
                                            style={{ fontFamily: 'monospace' }}
                                          />
                                          <div className="field-hint">Permanent — retire this field and add a new one to change it.</div>
                                        </div>
                                        <div className="field" style={{ marginBottom: 0, width: 110 }}>
                                          <label>Unit</label>
                                          <input
                                            type="text"
                                            value={editForm.unit}
                                            onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))}
                                            maxLength={20}
                                          />
                                        </div>
                                        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
                                          <label>Data type</label>
                                          <select
                                            className="select"
                                            value={editForm.dataType}
                                            disabled={field.valueCount > 0}
                                            onChange={e => setEditForm(f => ({ ...f, dataType: e.target.value as DataType }))}
                                          >
                                            {DATA_TYPES.map(t => (
                                              <option key={t.value} value={t.value}>{t.label}</option>
                                            ))}
                                          </select>
                                          {field.valueCount > 0 && (
                                            <div className="field-hint">
                                              Locked — {field.valueCount} product
                                              {field.valueCount === 1 ? ' has a value' : 's have values'} for this field.
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {editForm.dataType === 'enum' && (
                                        <div className="field" style={{ marginBottom: 0, maxWidth: 320 }}>
                                          <label>Options</label>
                                          <textarea
                                            className="textarea"
                                            rows={4}
                                            value={editForm.optionsText}
                                            onChange={e => setEditForm(f => ({ ...f, optionsText: e.target.value }))}
                                          />
                                          <div className="field-hint">One per line.</div>
                                        </div>
                                      )}

                                      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
                                          <input
                                            type="checkbox"
                                            checked={editForm.isComparable}
                                            onChange={e => setEditForm(f => ({ ...f, isComparable: e.target.checked }))}
                                          />
                                          Show as a comparison row
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
                                          <input
                                            type="checkbox"
                                            checked={editForm.isRequired}
                                            onChange={e => setEditForm(f => ({ ...f, isRequired: e.target.checked }))}
                                          />
                                          Required of merchants
                                        </label>
                                      </div>

                                      <div style={{ display: 'flex', gap: '0.5rem' }}>
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
              </>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
