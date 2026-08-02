import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import CompareTray from '@/components/CompareTray';
import { CompareProvider } from '@/lib/compare-context';

// Customer tab stack: the marketplace at the root, and a per-shop storefront
// stack pushed on top. The shop route hides ITS header here (headerShown:false)
// so the nested stack (shop/[subdomain]/_layout) owns the shop headers and the
// shop-scoped cart button.
//
// CompareProvider is mounted once HERE, not per shop the way CartProvider is —
// a cart belongs to one shop, a comparison spans them. The tray renders as a
// sibling of the Stack so it floats above whichever customer screen is showing,
// and never appears in the Merchant or Superadmin tabs.
export default function CustomerStackLayout() {
  return (
    <CompareProvider>
      <View style={styles.flex}>
        <Stack
          screenOptions={{
            headerTintColor: '#0f172a',
            headerTitleStyle: { fontWeight: '700', color: '#0f172a' },
            headerShadowVisible: false,
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Marketplace' }} />
          <Stack.Screen name="shop/[subdomain]" options={{ headerShown: false }} />
          <Stack.Screen name="compare" options={{ title: 'Compare' }} />
        </Stack>
        <CompareTray />
      </View>
    </CompareProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
