import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { AuthProvider } from '@/lib/auth';

// Sprint 0 navigation skeleton: three top-level areas mirroring the web app
// (Customer storefront, Merchant dashboard, Superadmin). AuthProvider (Sprint 1)
// wraps the tabs so merchant auth state is restored on launch and shared across
// screens. Customer/admin auth are not wired yet.
export default function RootLayout() {
  return (
    <AuthProvider>
      <Tabs screenOptions={{ tabBarActiveTintColor: '#0f172a' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Customer',
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
