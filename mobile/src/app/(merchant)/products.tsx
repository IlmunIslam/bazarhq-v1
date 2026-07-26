import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import Skeleton from '@/components/Skeleton';
import { deleteProduct, fetchProducts, type ProductListItem } from '@/lib/products-api';

// Merchant product list (B1). Status filter + debounced search, tap to edit,
// delete with confirm. Reloads on focus so returning from create/edit shows
// fresh data. All inside the Merchant stack.

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
] as const;

const STATUS_COLORS: Record<string, { fg: string; bg: string }> = {
  active: { fg: '#047857', bg: '#ecfdf5' },
  draft: { fg: '#b45309', bg: '#fffbeb' },
  archived: { fg: '#6b7280', bg: '#f3f4f6' },
};

export default function ProductsListScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchProducts({ status: statusFilter || undefined, search: search || undefined });
    if (res.success) setProducts(res.data.products);
    setLoading(false);
  }, [statusFilter, search]);

  // Reload whenever the screen regains focus (after add/edit/delete).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const confirmDelete = (item: ProductListItem) => {
    Alert.alert('Delete product', `Delete "${item.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(item.id);
          const res = await deleteProduct(item.id);
          setDeletingId(null);
          if (res.success) {
            setProducts(prev => prev.filter(p => p.id !== item.id));
          } else {
            Alert.alert('Could not delete', res.error.message);
          }
        },
      },
    ]);
  };

  const listHeader = (
    <View>
      <Stack.Screen
        options={{
          title: 'Products',
          headerRight: () => (
            <Pressable onPress={() => router.push('/products/new')} hitSlop={8} style={styles.headerAdd}>
              <Ionicons name="add" size={26} color="#0f172a" />
            </Pressable>
          ),
        }}
      />
      <View style={styles.tabsRow}>
        {STATUS_TABS.map(tab => {
          const active = statusFilter === tab.value;
          return (
            <Pressable
              key={tab.value || 'all'}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setStatusFilter(tab.value)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        style={styles.search}
        placeholder="Search products…"
        placeholderTextColor="#9ca3af"
        value={searchInput}
        onChangeText={setSearchInput}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        {listHeader}
        <View style={styles.listContent}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.row}>
              <Skeleton style={styles.thumb} />
              <View style={styles.rowMain}>
                <Skeleton style={styles.skLineWide} />
                <Skeleton style={styles.skLineNarrow} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={products}
      keyExtractor={p => p.id}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={listHeader}
      renderItem={({ item }) => (
        <ProductRow
          item={item}
          deleting={deletingId === item.id}
          onPress={() => router.push({ pathname: '/products/edit/[id]', params: { id: item.id } })}
          onDelete={() => confirmDelete(item)}
        />
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {search || statusFilter ? 'No products match your filters' : 'No products yet'}
          </Text>
          {!search && !statusFilter && (
            <Pressable style={styles.emptyCta} onPress={() => router.push('/products/new')}>
              <Text style={styles.emptyCtaText}>Add your first product</Text>
            </Pressable>
          )}
        </View>
      }
    />
  );
}

function ProductRow({
  item,
  deleting,
  onPress,
  onDelete,
}: {
  item: ProductListItem;
  deleting: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  const price = Number(item.basePrice);
  const compare = item.compareAtPrice ? Number(item.compareAtPrice) : null;
  const hasVariants = item._count.variants > 0;
  const badge = STATUS_COLORS[item.status] ?? STATUS_COLORS.draft;

  return (
    <Pressable style={styles.row} onPress={onPress}>
      {item.images[0] ? (
        <Image source={item.images[0].url} style={styles.thumb} contentFit="cover" transition={120} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Ionicons name="image-outline" size={20} color="#c4c7cc" />
        </View>
      )}

      <View style={styles.rowMain}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <View style={styles.metaRow}>
          <Text style={[styles.statusBadge, { color: badge.fg, backgroundColor: badge.bg }]}>{item.status}</Text>
          {item.category ? <Text style={styles.metaText}>{item.category.name}</Text> : null}
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.price}>৳{price.toLocaleString()}</Text>
          {compare ? <Text style={styles.was}>৳{compare.toLocaleString()}</Text> : null}
          <Text style={styles.stock}>· {hasVariants ? `${item._count.variants} variants` : `${item.stock} in stock`}</Text>
        </View>
      </View>

      <Pressable onPress={onDelete} hitSlop={8} style={styles.deleteBtn} disabled={deleting}>
        <Ionicons name="trash-outline" size={20} color={deleting ? '#d1d5db' : '#b91c1c'} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  listContent: { padding: 16, paddingBottom: 32 },
  headerAdd: { paddingHorizontal: 4 },

  tabsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  tabActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  tabTextActive: { color: '#ffffff' },

  search: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fafafa',
    marginBottom: 16,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  thumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#f3f4f6' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, gap: 3 },
  name: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
    textTransform: 'capitalize',
  },
  metaText: { fontSize: 13, color: '#6b7280' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  price: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  was: { fontSize: 12, color: '#9ca3af', textDecorationLine: 'line-through' },
  stock: { fontSize: 13, color: '#6b7280' },

  deleteBtn: { padding: 6 },

  skLineWide: { height: 13, width: '70%', borderRadius: 6 },
  skLineNarrow: { height: 12, width: '40%', borderRadius: 6, marginTop: 8 },

  empty: { paddingVertical: 56, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
  emptyCta: { marginTop: 16, backgroundColor: '#0f172a', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  emptyCtaText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});
