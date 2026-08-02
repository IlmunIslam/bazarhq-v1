import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCompare } from '@/lib/compare-context';

// Sprint C4 ships this as a real destination rather than leaving the tray's
// Compare button pointing at a missing route. It shows what the customer
// selected and is honest that the side-by-side comparison is not built yet.
//
// C5 replaces the list below with the real stacked-card comparison, fed by
// GET /v1/marketplace/compare?ids=… , which resolves each product's category and
// spec values server-side and drops any that are no longer visible. The route
// and the empty state stay as they are.
export default function CompareScreen() {
  const { items, ready, remove, clear } = useCompare();

  if (!ready) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Nothing selected yet</Text>
        <Text style={styles.muted}>
          Tap Compare on products in the marketplace to build a shortlist.
        </Text>
        <Link href="/" asChild>
          <Pressable style={styles.linkBtn}>
            <Text style={styles.linkBtnText}>Browse the marketplace</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <Text style={styles.count}>
          {items.length} product{items.length === 1 ? '' : 's'} selected
        </Text>
        <Pressable onPress={clear} hitSlop={8}>
          <Text style={styles.clear}>Clear all</Text>
        </Pressable>
      </View>

      <Text style={styles.note}>
        Side-by-side specification comparison is coming next. For now, here is your shortlist.
      </Text>

      {items.map(item => (
        <View key={item.id} style={styles.row}>
          {item.image ? (
            <Image source={item.image} style={styles.thumb} contentFit="cover" transition={120} />
          ) : (
            <View style={[styles.thumb, styles.noImg]} />
          )}
          <View style={styles.rowBody}>
            <Text style={styles.name} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.shop} numberOfLines={1}>
              {item.shop.name}
            </Text>
            <Text style={styles.price}>৳{Number(item.basePrice).toLocaleString()}</Text>
          </View>
          <View style={styles.rowActions}>
            <Link
              href={{
                pathname: '/shop/[subdomain]/product/[slug]',
                params: { subdomain: item.shop.subdomain, slug: item.slug },
              }}
              asChild
            >
              <Pressable style={styles.smallBtn} hitSlop={4}>
                <Text style={styles.smallBtnText}>View</Text>
              </Pressable>
            </Link>
            <Pressable style={styles.smallBtn} hitSlop={4} onPress={() => void remove(item.id)}>
              <Text style={styles.smallBtnText}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  // Clears the docked tray, which floats over this screen too.
  content: { padding: 16, paddingBottom: 180, gap: 12 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    padding: 24,
    gap: 8,
  },

  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  clear: { fontSize: 13, fontWeight: '600', color: '#6b7280' },

  note: { fontSize: 13, color: '#6b7280', lineHeight: 18 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  muted: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ececed',
    borderRadius: 14,
    backgroundColor: '#ffffff',
  },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#f3f4f6' },
  noImg: { backgroundColor: '#e5e7eb' },
  rowBody: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  shop: { fontSize: 12, color: '#6b7280' },
  price: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginTop: 2 },

  rowActions: { gap: 6 },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
  },
  smallBtnText: { fontSize: 12, fontWeight: '600', color: '#0f172a' },

  linkBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0f172a',
    borderRadius: 10,
  },
  linkBtnText: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
});
