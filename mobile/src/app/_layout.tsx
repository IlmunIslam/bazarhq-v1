import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

// Sprint 0 navigation skeleton: three top-level areas mirroring the web app
// (Customer storefront, Merchant dashboard, Superadmin). Screens are empty
// placeholders for now — only routing is wired here.
export default function RootLayout() {
  return (
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
  );
}
