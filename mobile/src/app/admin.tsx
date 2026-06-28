import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Placeholder — superadmin parity comes in a later sprint.
export default function AdminScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.kicker}>Admin · Sprint 0</Text>
      <Text style={styles.title}>Admin</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Superadmin screens land in a later sprint.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 8, backgroundColor: '#ffffff' },
  kicker: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, color: '#6b7280', textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '800', color: '#0f172a', marginBottom: 16 },
  placeholder: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, backgroundColor: '#fafafa' },
  placeholderText: { fontSize: 14, color: '#6b7280' },
});
