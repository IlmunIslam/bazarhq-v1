import { Stack } from 'expo-router';

import { AdminAuthProvider } from '@/lib/admin-auth';

// Superadmin tab stack. Like the Merchant stack this is self-contained: every
// admin screen is a sibling registered here, and navigation never crosses into
// another tab's route tree (expo-router throws "unmatched route" if it does).
//
// The root screen (index) gates login vs dashboard and draws its own in-body
// header, so its native header is hidden. AdminAuthProvider wraps the stack —
// not the app root — so admin auth only restores when this tab is first opened.
//
// Sub-screens live under a real `superadmin/` path segment (mirroring the web
// panel's /superadmin/* URLs) rather than sitting flat in the group. A flat
// `analytics.tsx` here would resolve to the same `/analytics` route as the
// Merchant tab's analytics screen, and expo-router would collapse the two.
export default function AdminStackLayout() {
  return (
    <AdminAuthProvider>
      <Stack
        screenOptions={{
          headerTintColor: '#0f172a',
          headerTitleStyle: { fontWeight: '700', color: '#0f172a' },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="superadmin/merchants" options={{ title: 'Merchants' }} />
        <Stack.Screen name="superadmin/analytics" options={{ title: 'Platform analytics' }} />
        <Stack.Screen name="superadmin/announcements" options={{ title: 'Announcements' }} />
        <Stack.Screen name="superadmin/audit-logs" options={{ title: 'Audit logs' }} />
      </Stack>
    </AdminAuthProvider>
  );
}
