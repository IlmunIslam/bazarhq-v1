import { Stack } from 'expo-router';

// Merchant tab stack. The root screen (index) gates login vs dashboard and
// renders its own in-body header, so its native header is hidden. Future
// sprints add products/orders as sibling screens with native headers + a back
// button to the dashboard.
export default function MerchantStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: '#0f172a',
        headerTitleStyle: { fontWeight: '700', color: '#0f172a' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="store-preview/[subdomain]" options={{ title: 'Store preview' }} />
      <Stack.Screen name="products" options={{ title: 'Products' }} />
      <Stack.Screen name="products/new" options={{ title: 'Add product' }} />
      <Stack.Screen name="products/edit/[id]" options={{ title: 'Edit product' }} />
      <Stack.Screen name="orders" options={{ title: 'Orders' }} />
      <Stack.Screen name="orders/[id]" options={{ title: 'Order' }} />
    </Stack>
  );
}
