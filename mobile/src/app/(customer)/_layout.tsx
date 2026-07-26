import { Stack } from 'expo-router';

// Customer tab stack: the marketplace at the root, and a per-shop storefront
// stack pushed on top. The shop route hides ITS header here (headerShown:false)
// so the nested stack (shop/[subdomain]/_layout) owns the shop headers and the
// shop-scoped cart button.
export default function CustomerStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: '#0f172a',
        headerTitleStyle: { fontWeight: '700', color: '#0f172a' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Marketplace' }} />
      <Stack.Screen name="shop/[subdomain]" options={{ headerShown: false }} />
    </Stack>
  );
}
