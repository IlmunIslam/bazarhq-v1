import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCompare } from '@/lib/compare-context';

// The docked shortlist, mirroring web's CompareTray. Appears as soon as ONE
// product is selected rather than at two: on a phone the card you just tapped
// scrolls out of view immediately, so with no tray the tap looks like it did
// nothing. The Compare action stays disabled until there are two, which is what
// actually communicates "one more".
//
// Rendered by (customer)/_layout as a sibling of the Stack, so it floats over
// the marketplace and every shop screen beneath it in that tab.
export default function CompareTray() {
  const { items, ready, limit, isFull, remove, clear } = useCompare();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // `ready` keeps the tray from flashing in before storage has been read.
  if (!ready || items.length === 0) return null;

  const canCompare = items.length >= 2;

  const hint = isFull
    ? `Comparing ${limit} of ${limit} — remove one to add another.`
    : !canCompare
      ? 'Select one more product to compare.'
      : null;

  return (
    // The tab bar already reserves the bottom inset, so only a small lift is
    // needed to clear it on devices with a home indicator.
    <View style={[styles.tray, { paddingBottom: 10 + Math.min(insets.bottom, 12) }]}>
      <View style={styles.headRow}>
        <Text style={styles.count}>
          {items.length} selected
        </Text>
        <Pressable onPress={clear} hitSlop={8}>
          <Text style={styles.clear}>Clear all</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.items}>
        {items.map(item => (
          <View key={item.id} style={styles.item}>
            {item.image ? (
              <Image source={item.image} style={styles.thumb} contentFit="cover" transition={120} />
            ) : (
              <View style={[styles.thumb, styles.noImg]} />
            )}
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Pressable onPress={() => remove(item.id)} hitSlop={8} accessibilityLabel={`Remove ${item.name}`}>
              <Ionicons name="close" size={15} color="#6b7280" />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      {hint && <Text style={styles.hint}>{hint}</Text>}

      <Pressable
        style={[styles.compareBtn, !canCompare && styles.compareBtnDisabled]}
        disabled={!canCompare}
        onPress={() => router.push('/compare')}
      >
        <Text style={styles.compareText}>Compare ({items.length})</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 10,
    paddingHorizontal: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  clear: { fontSize: 13, fontWeight: '600', color: '#6b7280' },

  items: { gap: 8, paddingBottom: 2 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
    paddingRight: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 999,
  },
  thumb: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#f3f4f6' },
  noImg: { backgroundColor: '#e5e7eb' },
  name: { fontSize: 12, color: '#0f172a', maxWidth: 110 },

  hint: { fontSize: 12, color: '#6b7280' },

  compareBtn: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  compareBtnDisabled: { opacity: 0.4 },
  compareText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
});
