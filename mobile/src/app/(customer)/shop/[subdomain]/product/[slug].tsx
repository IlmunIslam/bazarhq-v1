import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api } from '@/lib/api-client';
import { useCart } from '@/lib/cart-context';
import { useCompare } from '@/lib/compare-context';

// One product's detail (Sprint 2), scoped to the :subdomain route param. Image
// gallery, variant selector (first preselected, sold-out disabled), quantity
// stepper clamped to stock, add-to-cart into this shop's cart. compareAt applies
// only to the base price.

interface ProductImage {
  id: string;
  url: string;
}
interface Variant {
  id: string;
  name: string;
  sku: string | null;
  price: string;
  stock: number;
}
interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  basePrice: string;
  compareAtPrice: string | null;
  stock: number;
  images: ProductImage[];
  variants: Variant[];
}

export default function ProductDetailScreen() {
  const { subdomain, slug } = useLocalSearchParams<{ subdomain: string; slug: string }>();
  const { add } = useCart();
  // CompareProvider is mounted in (customer)/_layout, above the shop stack, so
  // it is already in scope here — and the tray it feeds already floats over
  // these screens. Only the toggle was missing.
  const { isSelected, isFull, toggle: toggleCompare } = useCompare();
  const router = useRouter();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [activeImage, setActiveImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [qty, setQty] = useState(1);
  // `added` is the transient 2s success flash on the button itself. `hasAdded`
  // is sticky for the life of the screen: the "Go to cart" shortcut must not
  // disappear from under someone who is still reading when the flash times out.
  const [added, setAdded] = useState(false);
  const [hasAdded, setHasAdded] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get<{ product: ProductDetail }>(`/storefront/${subdomain}/products/${slug}`)
      .then(res => {
        if (!active) return;
        if (res.success) {
          setProduct(res.data.product);
          if (res.data.product.variants.length > 0) {
            setSelectedVariant(res.data.product.variants[0]);
          }
        } else {
          setNotFound(true);
        }
      })
      .catch(() => active && setNotFound(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [subdomain, slug]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (notFound || !product) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.notFound}>Product not found.</Text>
      </View>
    );
  }

  const displayPrice = selectedVariant ? selectedVariant.price : product.basePrice;
  const displayStock = selectedVariant ? selectedVariant.stock : product.stock;
  const inStock = displayStock > 0;

  // Compare-at only applies to the base price (variants carry their own price).
  const compareAt = product.compareAtPrice ? Number(product.compareAtPrice) : null;
  const showCompare = !selectedVariant && compareAt !== null && compareAt > Number(displayPrice);
  const discount = showCompare ? Math.round((1 - Number(displayPrice) / compareAt!) * 100) : null;

  // Derived on every render rather than held in state, so it can never drift out
  // of sync with the quantity stepper or the selected variant's price.
  const unitPrice = Number(displayPrice);
  const lineTotal = unitPrice * qty;

  const handleAddToCart = async () => {
    await add({
      productId: product.id,
      variantId: selectedVariant?.id,
      name: product.name,
      variantName: selectedVariant?.name,
      price: Number(displayPrice),
      imageUrl: product.images[0]?.url,
      quantity: qty,
      slug: product.slug,
    });
    setAdded(true);
    setHasAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  // Stays inside this shop's stack — the cart is a sibling route of this screen.
  const goToCart = () =>
    router.push({ pathname: '/shop/[subdomain]/cart', params: { subdomain } });

  return (
    <>
      <Stack.Screen options={{ title: product.name }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Main image */}
        <View style={styles.mainImgWrap}>
          {product.images.length > 0 ? (
            <Image
              source={product.images[activeImage]?.url}
              style={styles.mainImg}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View style={[styles.mainImg, styles.noImg]}>
              <Text style={styles.noImgText}>No image</Text>
            </View>
          )}
          <View style={styles.badges}>
            {discount !== null && (
              <View style={[styles.badge, styles.badgeSale]}>
                <Text style={styles.badgeText}>−{discount}%</Text>
              </View>
            )}
            {!inStock && (
              <View style={[styles.badge, styles.badgeOos]}>
                <Text style={styles.badgeText}>Sold out</Text>
              </View>
            )}
          </View>
        </View>

        {/* Thumbnails */}
        {product.images.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbs}
          >
            {product.images.map((img, i) => (
              <Pressable
                key={img.id}
                onPress={() => setActiveImage(i)}
                style={[styles.thumb, i === activeImage && styles.thumbActive]}
              >
                <Image source={img.url} style={styles.thumbImg} contentFit="cover" />
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={styles.info}>
          <Text style={styles.name}>{product.name}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>৳{Number(displayPrice).toLocaleString()}</Text>
            {showCompare && <Text style={styles.was}>৳{compareAt!.toLocaleString()}</Text>}
            {discount !== null && <Text style={styles.saveBadge}>Save {discount}%</Text>}
          </View>

          {/* Variant selector */}
          {product.variants.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.label}>
                Variant
                {selectedVariant ? <Text style={styles.labelValue}>  {selectedVariant.name}</Text> : null}
              </Text>
              <View style={styles.variantBtns}>
                {product.variants.map(v => {
                  const active = selectedVariant?.id === v.id;
                  const oos = v.stock === 0;
                  return (
                    <Pressable
                      key={v.id}
                      disabled={oos}
                      onPress={() => {
                        setSelectedVariant(v);
                        setQty(1);
                      }}
                      style={[
                        styles.variantBtn,
                        active && styles.variantBtnActive,
                        oos && styles.variantBtnOos,
                      ]}
                    >
                      <Text style={[styles.variantBtnText, active && styles.variantBtnTextActive]}>
                        {v.name}
                        {oos ? ' (sold out)' : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Quantity + add to cart */}
          <View style={styles.actions}>
            <View style={styles.qtyControl}>
              <Pressable style={styles.qtyBtn} onPress={() => setQty(q => Math.max(1, q - 1))}>
                <Text style={styles.qtyBtnText}>−</Text>
              </Pressable>
              <Text style={styles.qtyVal}>{qty}</Text>
              <Pressable
                style={styles.qtyBtn}
                disabled={!inStock}
                onPress={() => setQty(q => Math.min(displayStock || 99, q + 1))}
              >
                <Text style={styles.qtyBtnText}>+</Text>
              </Pressable>
            </View>

            <Pressable
              style={[styles.addBtn, added && styles.addBtnAdded, !inStock && styles.addBtnDisabled]}
              disabled={!inStock}
              onPress={handleAddToCart}
            >
              <Text style={styles.addBtnText}>
                {added ? '✓ Added to cart' : inStock ? 'Add to Cart' : 'Out of Stock'}
              </Text>
            </Pressable>
          </View>

          {/* Live line total — recomputed on every quantity/variant change. */}
          {inStock && (
            <View
              style={styles.subtotal}
              accessibilityLiveRegion="polite"
              accessibilityLabel={`Total for ${qty} ${qty === 1 ? 'item' : 'items'}: ${lineTotal} taka`}
            >
              <Text style={styles.subtotalCalc}>
                ৳{unitPrice.toLocaleString()} × {qty}
              </Text>
              <Text style={styles.subtotalValue}>৳{lineTotal.toLocaleString()}</Text>
            </View>
          )}

          {hasAdded && (
            <Pressable style={styles.cartCta} onPress={goToCart}>
              <Text style={styles.cartCtaText}>Go to cart</Text>
              <Text style={styles.cartCtaArrow}>→</Text>
            </Pressable>
          )}

          {inStock && displayStock <= 5 && (
            <Text style={styles.lowStock}>Only {displayStock} left in stock</Text>
          )}

          {/* Compare against products from other shops. `shop.name` is not on
              this screen's payload, so the subdomain stands in — nothing
              displays the stored name, and the comparison view uses the
              authoritative one from the API. */}
          <Pressable
            style={[
              styles.compareBtn,
              isSelected(product.id) && styles.compareBtnOn,
              !isSelected(product.id) && isFull && styles.compareBtnBlocked,
            ]}
            disabled={!isSelected(product.id) && isFull}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected(product.id) }}
            onPress={() =>
              void toggleCompare({
                id: product.id,
                name: product.name,
                slug: product.slug,
                basePrice: product.basePrice,
                compareAtPrice: product.compareAtPrice,
                image: product.images[0]?.url ?? null,
                shop: { name: subdomain, subdomain },
              })
            }
          >
            <Text style={[styles.compareText, isSelected(product.id) && styles.compareTextOn]}>
              {isSelected(product.id) ? '✓ In comparison' : '+ Compare'}
            </Text>
          </Pressable>

          {product.description ? (
            <View style={styles.section}>
              <Text style={styles.label}>Description</Text>
              <Text style={styles.descText}>{product.description}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: 40 },
  notFound: { fontSize: 15, color: '#6b7280' },

  mainImgWrap: { width: '100%', aspectRatio: 1, backgroundColor: '#f3f4f6' },
  mainImg: { width: '100%', height: '100%' },
  noImg: { alignItems: 'center', justifyContent: 'center' },
  noImgText: { color: '#9ca3af', fontSize: 14 },
  badges: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 6 },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 },
  badgeSale: { backgroundColor: '#dc2626' },
  badgeOos: { backgroundColor: '#6b7280' },
  badgeText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },

  thumbs: { gap: 8, padding: 12 },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbActive: { borderColor: '#0f172a' },
  thumbImg: { width: '100%', height: '100%' },

  info: { padding: 20, gap: 8 },
  name: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  price: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  was: { fontSize: 16, color: '#9ca3af', textDecorationLine: 'line-through' },
  saveBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },

  section: { marginTop: 16, gap: 8 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 },
  labelValue: { color: '#6b7280', fontWeight: '600', textTransform: 'none', letterSpacing: 0 },

  variantBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  variantBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  variantBtnActive: { borderColor: '#0f172a', backgroundColor: '#0f172a' },
  variantBtnOos: { opacity: 0.4 },
  variantBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  variantBtnTextActive: { color: '#ffffff' },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
  },
  qtyBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  qtyBtnText: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  qtyVal: { fontSize: 16, fontWeight: '700', color: '#0f172a', minWidth: 24, textAlign: 'center' },

  addBtn: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addBtnAdded: { backgroundColor: '#047857' },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },

  subtotal: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#ececed',
    borderRadius: 10,
    backgroundColor: '#fafafa',
  },
  subtotalCalc: { fontSize: 14, color: '#6b7280' },
  subtotalValue: { fontSize: 18, fontWeight: '800', color: '#0f172a' },

  cartCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  cartCtaText: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  cartCtaArrow: { fontSize: 15, fontWeight: '700', color: '#0f172a' },

  compareBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  compareBtnOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  compareBtnBlocked: { opacity: 0.45 },
  compareText: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  compareTextOn: { color: '#ffffff' },

  lowStock: { fontSize: 13, color: '#b45309', marginTop: 10, fontWeight: '600' },
  descText: { fontSize: 15, color: '#374151', lineHeight: 22 },
});
