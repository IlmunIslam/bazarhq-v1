import { StackActions } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Link, useNavigation } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useCart } from '@/lib/cart-context';

// Mirrors the web cart (frontend/app/sites/[shop]/cart/page.tsx): line items
// with qty controls + remove, clear-cart, and an order summary. Checkout is out
// of scope for Sprint 2, so the summary ends at a disabled "coming soon" note
// where web has "Proceed to Checkout".

export default function CartScreen() {
  const { items, total, update, remove, clear } = useCart();
  const navigation = useNavigation();
  // Return to the list at the stack root — the "continue shopping" action.
  const goToStore = () => navigation.dispatch(StackActions.popToTop());

  if (items.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptySub}>Browse the store and add something you like.</Text>
        <Pressable style={styles.emptyCta} onPress={goToStore}>
          <Text style={styles.emptyCtaText}>Continue shopping</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {items.map(item => (
        <View key={`${item.productId}:${item.variantId ?? ''}`} style={styles.item}>
          <View style={styles.itemImgWrap}>
            {item.imageUrl ? (
              <Image source={item.imageUrl} style={styles.itemImg} contentFit="cover" />
            ) : (
              <View style={[styles.itemImg, styles.noImg]} />
            )}
          </View>

          <View style={styles.itemInfo}>
            <Link
              href={{ pathname: '/product/[slug]', params: { slug: item.slug } }}
              style={styles.itemName}
              numberOfLines={2}
            >
              {item.name}
            </Link>
            {item.variantName ? <Text style={styles.itemVariant}>{item.variantName}</Text> : null}
            <Text style={styles.itemPrice}>৳{item.price.toLocaleString()}</Text>

            <View style={styles.qtyControl}>
              <Pressable
                style={styles.qtyBtn}
                onPress={() => update(item.productId, item.variantId, item.quantity - 1)}
              >
                <Text style={styles.qtyBtnText}>−</Text>
              </Pressable>
              <Text style={styles.qtyVal}>{item.quantity}</Text>
              <Pressable
                style={styles.qtyBtn}
                onPress={() => update(item.productId, item.variantId, item.quantity + 1)}
              >
                <Text style={styles.qtyBtnText}>+</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.itemRight}>
            <Pressable
              hitSlop={8}
              onPress={() => remove(item.productId, item.variantId)}
              accessibilityLabel="Remove item"
            >
              <Text style={styles.remove}>×</Text>
            </Pressable>
            <Text style={styles.itemSubtotal}>
              ৳{(item.price * item.quantity).toLocaleString()}
            </Text>
          </View>
        </View>
      ))}

      <Pressable style={styles.clearBtn} onPress={clear}>
        <Text style={styles.clearBtnText}>Clear cart</Text>
      </Pressable>

      {/* Summary */}
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>Order Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>৳{total.toLocaleString()}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Shipping</Text>
          <Text style={styles.summaryMuted}>Calculated at checkout</Text>
        </View>
        <View style={styles.summaryTotalRow}>
          <Text style={styles.summaryTotalLabel}>Total</Text>
          <Text style={styles.summaryTotalValue}>৳{total.toLocaleString()}</Text>
        </View>

        <View style={styles.checkoutDisabled}>
          <Text style={styles.checkoutDisabledText}>Checkout coming soon</Text>
        </View>

        <Pressable style={styles.continue} onPress={goToStore}>
          <Text style={styles.continueText}>← Continue shopping</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 16, paddingBottom: 40 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#ffffff' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
  emptySub: { fontSize: 14, color: '#9ca3af', marginTop: 6, textAlign: 'center' },
  emptyCta: {
    marginTop: 20,
    backgroundColor: '#0f172a',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyCtaText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },

  item: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  itemImgWrap: { width: 84, height: 84, borderRadius: 10, overflow: 'hidden', backgroundColor: '#f3f4f6' },
  itemImg: { width: '100%', height: '100%' },
  noImg: { backgroundColor: '#f3f4f6' },
  itemInfo: { flex: 1, gap: 3 },
  itemName: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  itemVariant: { fontSize: 13, color: '#6b7280' },
  itemPrice: { fontSize: 14, color: '#374151', marginTop: 2 },

  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    marginTop: 8,
  },
  qtyBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  qtyBtnText: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  qtyVal: { fontSize: 14, fontWeight: '700', color: '#0f172a', minWidth: 22, textAlign: 'center' },

  itemRight: { alignItems: 'flex-end', justifyContent: 'space-between' },
  remove: { fontSize: 24, color: '#9ca3af', lineHeight: 24 },
  itemSubtotal: { fontSize: 15, fontWeight: '700', color: '#0f172a' },

  clearBtn: { alignSelf: 'flex-start', paddingVertical: 14 },
  clearBtnText: { fontSize: 14, color: '#b91c1c', fontWeight: '600' },

  summary: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fafafa',
    gap: 10,
  },
  summaryTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 14, color: '#374151' },
  summaryValue: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  summaryMuted: { fontSize: 14, color: '#9ca3af' },
  summaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 12,
    marginTop: 2,
  },
  summaryTotalLabel: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  summaryTotalValue: { fontSize: 16, fontWeight: '800', color: '#0f172a' },

  checkoutDisabled: {
    marginTop: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  checkoutDisabledText: { color: '#6b7280', fontSize: 15, fontWeight: '700' },

  continue: { alignItems: 'center', paddingTop: 4 },
  continueText: { fontSize: 14, color: '#6b7280', fontWeight: '600' },
});
