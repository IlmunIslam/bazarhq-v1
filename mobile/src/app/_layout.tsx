import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { AuthProvider } from '@/lib/auth';

// Top-level navigation: three tabs mirroring the web app (Customer, Merchant,
// Superadmin). The Customer tab opens on the marketplace and drills into a
// per-shop storefront stack (see (customer)/ route group). AuthProvider
// (Sprint 1) restores merchant auth on launch. The customer cart is now
// shop-scoped, so its CartProvider lives in the per-shop layout
// ((customer)/shop/[subdomain]/_layout) — not at the app root.
export default function RootLayout() {
  return (
    <AuthProvider>
      <Tabs screenOptions={{ tabBarActiveTintColor: '#0f172a' }}>
        <Tabs.Screen
          name="(customer)"
          options={{
            title: 'Customer',
            headerShown: false,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="storefront-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="merchant"
          options={{
            title: 'Merchant',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="briefcase-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="admin"
          options={{
            title: 'Admin',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="shield-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </AuthProvider>
  );
}
