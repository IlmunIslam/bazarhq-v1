import { Ionicons } from '@expo/vector-icons';
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CartProvider, useCart } from '@/lib/cart-context';

// One shop's storefront stack (storefront → product detail → cart), scoped to
// the :subdomain route param. The CartProvider here keys the cart to this shop
// (cart_${subdomain}), mirroring the web StorefrontShell — so each shop keeps a
// separate cart automatically. The header carries a shop-scoped cart button.
export default function ShopStackLayout() {
  const { subdomain } = useLocalSearchParams<{ subdomain: string }>();

  return (
    <CartProvider subdomain={subdomain}>
      <Stack
        screenOptions={{
          headerTintColor: '#0f172a',
          headerTitleStyle: { fontWeight: '700', color: '#0f172a' },
          headerShadowVisible: false,
          headerRight: () => <CartButton subdomain={subdomain} />,
        }}
      >
        {/* The nested stack's root: back goes to the marketplace (parent stack). */}
        <Stack.Screen name="index" options={{ title: 'Store', headerLeft: () => <BackButton /> }} />
        <Stack.Screen name="product/[slug]" options={{ title: '' }} />
        <Stack.Screen name="cart" options={{ title: 'Your Cart', headerRight: undefined }} />
      </Stack>
    </CartProvider>
  );
}

// React Navigation doesn't render a back button for a nested navigator's initial
// route, so provide one explicitly to return to the marketplace.
function BackButton() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={8}
      style={styles.backButton}
      accessibilityRole="button"
      accessibilityLabel="Back to marketplace"
    >
      <Ionicons name="chevron-back" size={26} color="#0f172a" />
    </Pressable>
  );
}

function CartButton({ subdomain }: { subdomain: string }) {
  const { count } = useCart();
  return (
    <Link href={{ pathname: '/shop/[subdomain]/cart', params: { subdomain } }} asChild>
      <Pressable
        style={styles.cartButton}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="View cart"
      >
        <Ionicons name="cart-outline" size={24} color="#0f172a" />
        {count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
          </View>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  backButton: { paddingRight: 8, paddingVertical: 2 },
  cartButton: { paddingHorizontal: 4, paddingVertical: 2 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
});
