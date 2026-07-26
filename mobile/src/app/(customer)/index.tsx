import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  fetchMarketplaceProducts,
  fetchMarketplaceShops,
  type MarketplaceProduct,
  type MarketplaceShop,
  type ShopSort,
} from '@/lib/marketplace-api';

// Marketplace home for the Customer tab — mirrors the web /marketplace page:
// a horizontal Shops row (Popular/Newest toggle) above a cross-shop product
// feed with debounced search and cursor pagination. Tapping a product/shop
// drills into that shop's storefront stack (shop/[subdomain]/…), where the
// shop-scoped cart lives. Loading skeletons keep it feeling instant.

const PAGE_SIZE = 20;
const PRODUCT_SKELETONS = 6;
const SHOP_SKELETONS = 5;

type ProductRow = MarketplaceProduct | { __skeleton: true; id: string };

export default function MarketplaceScreen() {
  const [shopSort, setShopSort] = useState<ShopSort>('popular');
  const [shops, setShops] = useState<MarketplaceShop[] | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce the search box (web uses 350ms).
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Shops react to the Popular/Newest toggle.
  useEffect(() => {
    let active = true;
    setShops(null);
    fetchMarketplaceShops({ sort: shopSort, limit: 12 }).then(res => {
      if (!active) return;
      setShops(res.success ? res.data.shops : []);
    });
    return () => {
      active = false;
    };
  }, [shopSort]);

  // Products react to search — reload page 1. Guard against out-of-order results.
  const reqId = useRef(0);
  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    fetchMarketplaceProducts({ search, limit: PAGE_SIZE }).then(res => {
      if (id !== reqId.current) return;
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
  }, [search]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || loading) return;
    setLoadingMore(true);
    const res = await fetchMarketplaceProducts({ search, cursor: nextCursor, limit: PAGE_SIZE });
    if (res.success) {
      setProducts(prev => [...prev, ...res.data.products]);
      setNextCursor(res.data.nextCursor);
    }
    setLoadingMore(false);
  }, [nextCursor, loadingMore, loading, search]);

  const listHeader = useMemo(
    () => (
      <View>
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            placeholder="Search products across all shops…"
            placeholderTextColor="#9ca3af"
            value={searchInput}
            onChangeText={setSearchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Shops</Text>
          <View style={styles.toggle}>
            {(['popular', 'newest'] as const).map(s => {
              const active = shopSort === s;
              return (
                <Pressable
                  key={s}
                  style={[styles.toggleBtn, active && styles.toggleBtnActive]}
                  onPress={() => setShopSort(s)}
                >
                  <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                    {s === 'popular' ? 'Popular' : 'Newest'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {shops === null ? (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={Array.from({ length: SHOP_SKELETONS }, (_, i) => i)}
            keyExtractor={i => `shop-sk-${i}`}
            contentContainerStyle={styles.shopRow}
            renderItem={() => <ShopCardSkeleton />}
          />
        ) : shops.length === 0 ? (
          <Text style={styles.sectionEmpty}>No shops published yet.</Text>
        ) : (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={shops}
            keyExtractor={s => s.id}
            contentContainerStyle={styles.shopRow}
            renderItem={({ item }) => <ShopCard shop={item} />}
          />
        )}

        <Text style={[styles.sectionTitle, styles.productsTitle]}>All products</Text>
      </View>
    ),
    [searchInput, shopSort, shops],
  );

  const data: ProductRow[] = loading
    ? Array.from({ length: PRODUCT_SKELETONS }, (_, i) => ({ __skeleton: true as const, id: `p-sk-${i}` }))
    : products;

  return (
    <FlatList
      style={styles.container}
      data={data}
      keyExtractor={item => item.id}
      numColumns={2}
      columnWrapperStyle={styles.column}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={listHeader}
      renderItem={({ item }) =>
        '__skeleton' in item ? <ProductCardSkeleton /> : <ProductCard product={item} />
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      keyboardShouldPersistTaps="handled"
      ListFooterComponent={
        loadingMore ? <ActivityIndicator style={styles.footer} /> : <View style={styles.footer} />
      }
      ListEmptyComponent={
        !loading ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {error ? 'Could not load products' : search ? 'No products match your search' : 'No products yet'}
            </Text>
            <Text style={styles.emptySub}>
              {error ?? (search ? 'Try a different keyword.' : 'Check back soon.')}
            </Text>
          </View>
        ) : null
      }
    />
  );
}

// ── Cards ───────────────────────────────────────────────────────────────────

function ProductCard({ product }: { product: MarketplaceProduct }) {
  const price = Number(product.basePrice);
  const compare = product.compareAtPrice ? Number(product.compareAtPrice) : null;
  const discount = compare && compare > price ? Math.round((1 - price / compare) * 100) : null;

  return (
    <Link
      href={{
        pathname: '/shop/[subdomain]/product/[slug]',
        params: { subdomain: product.shop.subdomain, slug: product.slug },
      }}
      asChild
    >
      <Pressable style={styles.card}>
        <View style={styles.cardImgWrap}>
          {product.image ? (
            <Image source={product.image} style={styles.cardImg} contentFit="cover" transition={150} />
          ) : (
            <View style={[styles.cardImg, styles.noImg]}>
              <Text style={styles.noImgText}>No image</Text>
            </View>
          )}
          {discount !== null && (
            <View style={styles.badges}>
              <View style={[styles.badge, styles.badgeSale]}>
                <Text style={styles.badgeText}>−{discount}%</Text>
              </View>
            </View>
          )}
        </View>
        <Text style={styles.cardName} numberOfLines={2}>
          {product.name}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>৳{price.toLocaleString()}</Text>
          {compare ? <Text style={styles.was}>৳{compare.toLocaleString()}</Text> : null}
        </View>
        <Text style={styles.cardShop} numberOfLines={1}>
          {product.shop.name}
        </Text>
      </Pressable>
    </Link>
  );
}

function ShopCard({ shop }: { shop: MarketplaceShop }) {
  return (
    <Link href={{ pathname: '/shop/[subdomain]/index', params: { subdomain: shop.subdomain } }} asChild>
      <Pressable style={styles.shopCard}>
        <View style={styles.shopLogoWrap}>
          {shop.logoUrl ? (
            <Image source={shop.logoUrl} style={styles.shopLogo} contentFit="cover" />
          ) : (
            <Text style={styles.shopLogoFallback}>{shop.name.charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <Text style={styles.shopName} numberOfLines={1}>
          {shop.name}
        </Text>
        <Text style={styles.shopMeta}>
          {shop.productCount} {shop.productCount === 1 ? 'product' : 'products'}
        </Text>
      </Pressable>
    </Link>
  );
}

// ── Skeletons ────────────────────────────────────────────────────────────────

function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.skeleton, { opacity }, style]} />;
}

function ProductCardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton style={styles.cardImgWrap} />
      <Skeleton style={styles.skLineName} />
      <Skeleton style={styles.skLinePrice} />
    </View>
  );
}

function ShopCardSkeleton() {
  return (
    <View style={styles.shopCard}>
      <Skeleton style={styles.shopLogoWrap} />
      <Skeleton style={styles.skShopName} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  column: { gap: 12 },
  footer: { paddingVertical: 20 },

  searchWrap: { paddingTop: 14, marginBottom: 18 },
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

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  productsTitle: { marginTop: 22, marginBottom: 14 },
  sectionEmpty: { fontSize: 14, color: '#9ca3af', paddingVertical: 8 },

  toggle: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 999, padding: 3 },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  toggleBtnActive: { backgroundColor: '#ffffff' },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  toggleTextActive: { color: '#0f172a' },

  shopRow: { gap: 12, paddingBottom: 4 },
  shopCard: {
    width: 130,
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderColor: '#ececed',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    gap: 8,
  },
  shopLogoWrap: {
    width: 56,
    height: 56,
    borderRadius: 999,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  shopLogo: { width: '100%', height: '100%' },
  shopLogoFallback: { fontSize: 22, fontWeight: '700', color: '#9ca3af' },
  shopName: { fontSize: 14, fontWeight: '600', color: '#0f172a', textAlign: 'center' },
  shopMeta: { fontSize: 12, color: '#9ca3af' },

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
  badges: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeSale: { backgroundColor: '#dc2626' },
  badgeText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },

  cardName: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginTop: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  price: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  was: { fontSize: 13, color: '#9ca3af', textDecorationLine: 'line-through' },
  cardShop: { fontSize: 12, color: '#6b7280', marginTop: 3 },

  skeleton: { backgroundColor: '#e5e7eb', borderRadius: 8 },
  skLineName: { height: 12, borderRadius: 6, marginTop: 10 },
  skLinePrice: { height: 12, width: '55%', borderRadius: 6, marginTop: 8 },
  skShopName: { height: 12, width: 80, borderRadius: 6 },

  empty: { paddingVertical: 48, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
  emptySub: { fontSize: 14, color: '#9ca3af', marginTop: 6, textAlign: 'center', paddingHorizontal: 24 },
});
