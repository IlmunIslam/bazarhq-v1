import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import StorefrontView from '@/components/StorefrontView';

// Read-only preview of the merchant's OWN published storefront, rendered INSIDE
// the Merchant stack (so the header back button returns to the dashboard — no
// cross-tab navigation). Reuses the shared StorefrontView with no onProductPress,
// so the grid shows exactly what a customer sees but nothing is tappable.
export default function StorePreviewScreen() {
  const { subdomain } = useLocalSearchParams<{ subdomain: string }>();

  return (
    <View style={styles.root}>
      <View style={styles.banner}>
        <Ionicons name="eye-outline" size={16} color="#6b7280" />
        <Text style={styles.bannerText}>Read-only preview — this is how customers see your store.</Text>
      </View>
      <StorefrontView subdomain={subdomain} showShopTitle={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f2',
  },
  bannerText: { flexShrink: 1, fontSize: 13, color: '#6b7280' },
});
