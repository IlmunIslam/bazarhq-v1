import { Image } from 'expo-image';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api } from '@/lib/api-client';

// One shop's storefront home (Sprint 2), now scoped to the :subdomain route
// param instead of a hardcoded ACTIVE_SHOP. Mirrors the web storefront homepage:
// category pills + debounced search + cursor-paginated product grid. Products
// link into this same shop's product detail.

interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  basePrice: string;
  compareAtPrice: string | null;
  stock: number;
  images: { url: string }[];
  _count: { variants: number };
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface ShopResponse {
  shop: { name: string; description: string | null };
  categories: Category[];
}

interface ProductsResponse {
  products: ProductListItem[];
  nextCursor: string | null;
}

const PAGE_SIZE = 20;

export default function ShopHomeScreen() {
  const { subdomain } = useLocalSearchParams<{ subdomain: string }>();

  const [shopName, setShopName] = useState('');
  const [shopDescription, setShopDescription] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  const [activeCategory, setActiveCategory] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load shop meta (name + categories) once.
  useEffect(() => {
    api.get<ShopResponse>(`/storefront/${subdomain}`).then(res => {
      if (res.success) {
        setShopName(res.data.shop.name);
        setShopDescription(res.data.shop.description);
        setCategories(res.data.categories);
      }
    });
  }, [subdomain]);

  // Debounce the search box (web uses 350ms).
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchProducts = useCallback(
    async (opts: { category?: string; search?: string; cursor?: string }) => {
      const params = new URLSearchParams();
      if (opts.category) params.set('category', opts.category);
      if (opts.search) params.set('search', opts.search);
      if (opts.cursor) params.set('cursor', opts.cursor);
      params.set('limit', String(PAGE_SIZE));
      return api.get<ProductsResponse>(`/storefront/${subdomain}/products?${params}`);
    },
    [subdomain],
  );

  // Reload when filters change.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchProducts({ category: activeCategory, search }).then(res => {
      if (!active) return;
      if (res.success) {
        setProducts(res.data.products);
        setNextCursor(res.data.nextCursor);
      } else {
        setError(res.error.message);
        setProducts([]);
        setNextCursor(null);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [activeCategory, search, fetchProducts]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const res = await fetchProducts({ category: activeCategory, search, cursor: nextCursor });
    if (res.success) {
      setProducts(prev => [...prev, ...res.data.products]);
      setNextCursor(res.data.nextCursor);
    }
    setLoadingMore(false);
  }, [nextCursor, loadingMore, fetchProducts, activeCategory, search]);

  const listHeader = useMemo(
    () => (
      <View>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{shopName || 'Store'}</Text>
          {shopDescription ? <Text style={styles.heroSubtitle}>{shopDescription}</Text> : null}
        </View>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ id: 'all', name: 'All', slug: '' }, ...categories]}
          keyExtractor={c => c.id}
          contentContainerStyle={styles.pillsRow}
          renderItem={({ item }) => {
            const active = activeCategory === item.slug;
            return (
              <Pressable
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => setActiveCategory(item.slug)}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{item.name}</Text>
              </Pressable>
            );
          }}
        />

        <View style={styles.searchWrap}>
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
      </View>
    ),
    [shopName, shopDescription, categories, activeCategory, searchInput],
  );

  return (
    <>
      <Stack.Screen options={{ title: shopName || 'Store' }} />
      <FlatList
        style={styles.container}
        data={loading ? [] : products}
        keyExtractor={p => p.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => <ProductCard product={item} subdomain={subdomain} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          loading ? (
            <ActivityIndicator style={styles.footer} />
          ) : loadingMore ? (
            <ActivityIndicator style={styles.footer} />
          ) : (
            <View style={styles.footer} />
          )
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {error ? 'Could not load products' : search || activeCategory ? 'No products match' : 'No products yet'}
              </Text>
              <Text style={styles.emptySub}>
                {error ?? (search || activeCategory ? 'Try a different keyword or category.' : 'Check back soon.')}
              </Text>
            </View>
          ) : null
        }
      />
    </>
  );
}

function ProductCard({ product, subdomain }: { product: ProductListItem; subdomain: string }) {
  const price = Number(product.basePrice);
  const compare = product.compareAtPrice ? Number(product.compareAtPrice) : null;
  const discount = compare && compare > price ? Math.round((1 - price / compare) * 100) : null;
  const soldOut = product.stock <= 0;

  return (
    <Link
      href={{ pathname: '/shop/[subdomain]/product/[slug]', params: { subdomain, slug: product.slug } }}
      asChild
    >
      <Pressable style={styles.card}>
        <View style={styles.cardImgWrap}>
          {product.images[0] ? (
            <Image source={product.images[0].url} style={styles.cardImg} contentFit="cover" transition={150} />
          ) : (
            <View style={[styles.cardImg, styles.noImg]}>
              <Text style={styles.noImgText}>No image</Text>
            </View>
          )}
          <View style={styles.badges}>
            {discount !== null && (
              <View style={[styles.badge, styles.badgeSale]}>
                <Text style={styles.badgeText}>−{discount}%</Text>
              </View>
            )}
            {soldOut && (
              <View style={[styles.badge, styles.badgeOos]}>
                <Text style={styles.badgeText}>Sold out</Text>
              </View>
            )}
          </View>
        </View>
        <Text style={styles.cardName} numberOfLines={2}>
          {product.name}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>৳{price.toLocaleString()}</Text>
          {compare ? <Text style={styles.was}>৳{compare.toLocaleString()}</Text> : null}
        </View>
        {product._count.variants > 0 && (
          <Text style={styles.variantsNote}>{product._count.variants} options</Text>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  column: { gap: 12 },
  footer: { paddingVertical: 20 },

  hero: { paddingTop: 12, paddingBottom: 4 },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#0f172a' },
  heroSubtitle: { fontSize: 14, color: '#6b7280', marginTop: 4 },

  pillsRow: { gap: 8, paddingVertical: 14 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  pillActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  pillText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  pillTextActive: { color: '#ffffff' },

  searchWrap: { marginBottom: 16 },
  search: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fafafa',
  },

  card: { flex: 1, marginBottom: 16 },
  cardImgWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
    aspectRatio: 1,
  },
  cardImg: { width: '100%', height: '100%' },
  noImg: { alignItems: 'center', justifyContent: 'center' },
  noImgText: { color: '#9ca3af', fontSize: 13 },
  badges: { position: 'absolute', top: 8, left: 8, gap: 4, flexDirection: 'row' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeSale: { backgroundColor: '#dc2626' },
  badgeOos: { backgroundColor: '#6b7280' },
  badgeText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },

  cardName: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginTop: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  price: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  was: { fontSize: 13, color: '#9ca3af', textDecorationLine: 'line-through' },
  variantsNote: { fontSize: 12, color: '#6b7280', marginTop: 2 },

  empty: { paddingVertical: 48, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
  emptySub: { fontSize: 14, color: '#9ca3af', marginTop: 6, textAlign: 'center', paddingHorizontal: 24 },
});
