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
    </Stack>
  );
}
