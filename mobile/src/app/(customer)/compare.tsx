import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCompare } from '@/lib/compare-context';
import {
  NONE,
  compareMode,
  discountOf,
  displaySpec,
  formatTk,
  groupRows,
  rowVaries,
} from '@/lib/compare-format';
import { fetchComparison, type ComparePayload, type CompareProduct } from '@/lib/marketplace-api';

// Side-by-side comparison (Sprint C5), mobile.
//
// Deliberately NOT the web table shrunk down — a wide table on a phone is the
// failure mode this design avoids. Instead: a sticky product header keeps the
// columns identifiable, and each attribute is its own card with the products as
// cells inside it. Vertical scrolling only, no horizontal scroll, no pinch-zoom.
//
// Same three render modes as web, driven by the server's `sharedCategoryId` so
// neither client re-derives the alignment rule.

export default function CompareScreen() {
  const { items, ready, remove, clear, keepOnly } = useCompare();

  const [data, setData] = useState<ComparePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [diffOnly, setDiffOnly] = useState(false);

  // Keyed on the joined ids rather than the array, which is a new reference
  // every render.
  const idKey = items.map(i => i.id).join(',');

  const load = useCallback(async () => {
    if (idKey === '') {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await fetchComparison(idKey.split(','));
    setLoading(false);

    // A failed request is not an empty catalogue — leave the tray alone so a
    // dropped connection can never silently discard a selection.
    if (!res.success) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setData(res.data);

    if (res.data.droppedIds.length > 0) {
      await keepOnly(res.data.products.map(p => p.id));
    }
  }, [idKey, keepOnly]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  const products = data?.products ?? [];
  const mode = compareMode(
    products.length,
    data?.categories.length ?? 0,
    data?.sharedCategoryId ?? null,
  );

  const specRows = data?.specRows ?? [];
  const visibleRows = diffOnly ? specRows.filter(r => rowVaries(products, r)) : specRows;
  const hiddenCount = specRows.length - visibleRows.length;
  const grouped = groupRows(visibleRows);

  const categoryName = (id: string | null) =>
    data?.categories.find(c => c.id === id)?.name ?? 'Other';

  if (!ready || loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  if (products.length === 0) {
    return (
      <View style={styles.center}>
        {failed && <Text style={styles.error}>Could not load the comparison. Your selection is safe.</Text>}
        <Text style={styles.emptyTitle}>Nothing to compare</Text>
        <Text style={styles.muted}>
          Tap Compare on products in the marketplace to build a shortlist.
        </Text>
        <Link href="/" asChild>
          <Pressable style={styles.linkBtn}>
            <Text style={styles.linkBtnText}>Browse the marketplace</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  /** One attribute: a title and a cell per product. */
  const AttributeCard = ({
    label,
    cell,
    strong,
  }: {
    label: string;
    cell: (p: CompareProduct) => string;
    strong?: boolean;
  }) => (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      <View style={styles.cells}>
        {products.map(p => (
          <View key={p.id} style={styles.cell}>
            <Text style={[styles.cellText, strong && styles.cellStrong]} numberOfLines={3}>
              {cell(p)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      stickyHeaderIndices={[1]}
    >
      {/* Index 0 — scrolls away; the product header below it is what sticks. */}
      <View style={styles.topBar}>
        {specRows.length > 0 && (
          <Pressable
            style={[styles.segment, diffOnly && styles.segmentOn]}
            onPress={() => setDiffOnly(v => !v)}
          >
            <Ionicons
              name={diffOnly ? 'checkbox' : 'square-outline'}
              size={15}
              color={diffOnly ? '#ffffff' : '#374151'}
            />
            <Text style={[styles.segmentText, diffOnly && styles.segmentTextOn]}>
              Differences only
            </Text>
          </Pressable>
        )}
        <Pressable onPress={clear} hitSlop={8}>
          <Text style={styles.clear}>Clear all</Text>
        </Pressable>
      </View>

      {/* Index 1 — sticky, so the columns stay identifiable while scrolling. */}
      <View style={styles.header}>
        {products.map(p => (
          <View key={p.id} style={styles.headerCol}>
            <Pressable
              style={styles.removeBtn}
              onPress={() => void remove(p.id)}
              hitSlop={6}
              accessibilityLabel={`Remove ${p.name} from comparison`}
            >
              <Ionicons name="close" size={13} color="#6b7280" />
            </Pressable>
            {p.image ? (
              <Image source={p.image} style={styles.thumb} contentFit="cover" transition={120} />
            ) : (
              <View style={[styles.thumb, styles.noImg]} />
            )}
            <Text style={styles.headerName} numberOfLines={2}>
              {p.name}
            </Text>
            <Text style={styles.headerPrice}>{formatTk(p.basePrice)}</Text>
          </View>
        ))}
      </View>

      {mode === 'mixed' && (
        <Text style={styles.banner}>
          These products are in different categories, so only price and general details can be
          compared directly.
        </Text>
      )}
      {mode === 'uncategorised' && (
        <Text style={styles.banner}>
          These products haven&apos;t been categorised for comparison yet, so only price and general
          details are shown.
        </Text>
      )}

      {/* Always shown — meaningful whatever the categories */}
      <AttributeCard label="Price" cell={p => formatTk(p.basePrice)} strong />
      <AttributeCard label="Discount" cell={discountOf} />
      <AttributeCard label="Shop" cell={p => p.shop.name} />
      <AttributeCard label="Category" cell={p => p.category?.name ?? NONE} />

      {grouped.map(group => (
        <View key={group.categoryId ?? 'none'}>
          {mode === 'mixed' && (
            <Text style={styles.groupHeading}>{categoryName(group.categoryId)}</Text>
          )}
          {group.rows.map(row => (
            <AttributeCard key={row.specFieldId} label={row.label} cell={p => displaySpec(p, row)} />
          ))}
        </View>
      ))}

      {diffOnly && hiddenCount > 0 && (
        <Text style={styles.note}>
          {hiddenCount} identical row{hiddenCount === 1 ? '' : 's'} hidden.
        </Text>
      )}
      {diffOnly && specRows.length > 0 && visibleRows.length === 0 && (
        <Text style={styles.note}>These products match on every specification.</Text>
      )}
      {mode !== 'uncategorised' && specRows.length === 0 && (
        <Text style={styles.note}>
          No comparable specifications have been defined for these categories yet.
        </Text>
      )}

      {/* Buying still happens in the shop's own storefront — comparison is a
          discovery surface, consistent with the marketplace's boundary. */}
      <View style={styles.footer}>
        {products.map(p => (
          <View key={p.id} style={styles.cell}>
            <Link
              href={{
                pathname: '/shop/[subdomain]/product/[slug]',
                params: { subdomain: p.shop.subdomain, slug: p.slug },
              }}
              asChild
            >
              <Pressable style={styles.viewBtn}>
                <Text style={styles.viewBtnText}>View</Text>
              </Pressable>
            </Link>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  // Clears the docked compare tray, which floats over this screen too.
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 190 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    padding: 24,
    gap: 8,
  },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  segmentOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  segmentText: { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  segmentTextOn: { color: '#ffffff' },
  clear: { fontSize: 13, fontWeight: '600', color: '#6b7280' },

  header: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 10,
    paddingTop: 2,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerCol: { flex: 1, alignItems: 'center', gap: 3 },
  removeBtn: { position: 'absolute', top: -2, right: -2, zIndex: 2, padding: 2 },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#f3f4f6' },
  noImg: { backgroundColor: '#e5e7eb' },
  headerName: { fontSize: 11.5, fontWeight: '600', color: '#0f172a', textAlign: 'center' },
  headerPrice: { fontSize: 12.5, fontWeight: '800', color: '#0f172a' },

  banner: {
    fontSize: 12.5,
    color: '#92400e',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 8,
    padding: 10,
    lineHeight: 18,
    marginTop: 12,
  },

  groupHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 16,
    marginBottom: 4,
  },

  card: {
    borderWidth: 1,
    borderColor: '#ececed',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#ffffff',
    marginTop: 10,
  },
  cardLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 8 },
  cells: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1, alignItems: 'center' },
  cellText: { fontSize: 13, color: '#0f172a', textAlign: 'center' },
  cellStrong: { fontWeight: '800' },

  note: { fontSize: 12.5, color: '#6b7280', marginTop: 12, lineHeight: 18 },

  footer: { flexDirection: 'row', gap: 8, marginTop: 16 },
  viewBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  viewBtnText: { fontSize: 12.5, fontWeight: '700', color: '#0f172a' },

  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  muted: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  error: { fontSize: 13, fontWeight: '600', color: '#b91c1c', textAlign: 'center' },

  linkBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0f172a',
    borderRadius: 10,
  },
  linkBtnText: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
});
