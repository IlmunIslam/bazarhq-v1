import { Ionicons } from '@expo/vector-icons';
import { Link, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useCart } from '@/lib/cart-context';

// Nested stack for the Customer tab: product list → product detail → cart.
// A cart button with a live item-count badge sits in every screen's header.
export default function CustomerStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: '#0f172a',
        headerTitleStyle: { fontWeight: '700', color: '#0f172a' },
        headerShadowVisible: false,
        headerRight: () => <CartButton />,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Store' }} />
      <Stack.Screen name="product/[slug]" options={{ title: '' }} />
      <Stack.Screen name="cart" options={{ title: 'Your Cart', headerRight: undefined }} />
    </Stack>
  );
}

function CartButton() {
  const { count } = useCart();
  return (
    <Link href="/cart" asChild>
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
