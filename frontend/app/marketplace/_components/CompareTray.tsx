'use client';

import { useRouter } from 'next/navigation';
import { useCompare } from '@/lib/compare-context';

// The docked shortlist. Appears as soon as ONE product is selected, rather than
// at two as originally sketched: selecting your first product and seeing nothing
// happen reads as a broken button, especially on a long grid where the card
// scrolls out of view. The Compare action stays disabled until there are two,
// which is what actually communicates "one more".
export default function CompareTray() {
  const { items, ready, limit, isFull, remove, clear } = useCompare();
  const router = useRouter();

  // `ready` keeps the tray from flashing in before storage has been read.
  if (!ready || items.length === 0) return null;

  const canCompare = items.length >= 2;

  const hint = isFull
    ? `Comparing ${limit} of ${limit} — remove one to add another.`
    : !canCompare
      ? 'Select one more product to compare.'
      : null;

  return (
    <div className="cmp-tray" role="region" aria-label="Comparison selection">
      <div className="cmp-tray-inner">
        <ul className="cmp-tray-items">
          {items.map(item => (
            <li key={item.id} className="cmp-tray-item">
              {item.image ? (
                <img src={item.image} alt="" className="cmp-tray-thumb" loading="lazy" />
              ) : (
                <span className="cmp-tray-thumb cmp-tray-thumb--empty" aria-hidden="true" />
              )}
              <span className="cmp-tray-name">{item.name}</span>
              <button
                type="button"
                className="cmp-tray-remove"
                onClick={() => remove(item.id)}
                aria-label={`Remove ${item.name} from comparison`}
                title="Remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        <div className="cmp-tray-actions">
          {hint && <span className="cmp-tray-hint">{hint}</span>}
          <button type="button" className="btn btn-secondary btn-sm" onClick={clear}>
            Clear all
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!canCompare}
            onClick={() => router.push('/marketplace/compare')}
          >
            Compare ({items.length})
          </button>
        </div>
      </div>
    </div>
  );
}
