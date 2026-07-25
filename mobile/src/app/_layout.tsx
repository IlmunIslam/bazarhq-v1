import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { AuthProvider } from '@/lib/auth';
import { CartProvider } from '@/lib/cart-context';

// Top-level navigation: three tabs mirroring the web app (Customer storefront,
// Merchant dashboard, Superadmin). The Customer tab is a nested stack living in
// the (customer)/ route group (list → product detail → cart). AuthProvider
// (Sprint 1) restores merchant auth on launch; CartProvider (Sprint 2) restores
// the customer cart from AsyncStorage and shares it across the customer stack.
export default function RootLayout() {
  return (
    <AuthProvider>
      <CartProvider>
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
      </CartProvider>
    </AuthProvider>
  );
}
