import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import Skeleton from '@/components/Skeleton';
import { fetchAuditLogs, formatDateTime, type AuditLog } from '@/lib/admin-api';

// Audit logs — mirrors /superadmin/audit-logs. Strictly read-only: the table is
// INSERT-only and enforced as such by a Postgres trigger, so there is nothing
// to mutate here. Cursor-paginated, 50 at a time.

// Colour-codes the action so destructive events stand out while scrolling.
function toneFor(action: string): 'danger' | 'success' | 'neutral' {
  const a = action.toUpperCase();
  if (a.includes('SUSPEND') || a.includes('DISABLED') || a.includes('DELETE')) return 'danger';
  if (a.includes('ACTIVAT') || a.includes('VERIFIED') || a.includes('ENABLED') || a.includes('CREATED')) {
    return 'success';
  }
  return 'neutral';
}

export default function AdminAuditLogsScreen() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [action, setAction] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await fetchAuditLogs({ action: action.trim() || undefined });
    if (res.success) {
      setLogs(res.data.logs);
      setCursor(res.data.nextCursor);
    } else {
      setError(res.error.message);
    }
    setLoading(false);
  }, [action]);

  // Debounced so typing the action filter doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const res = await fetchAuditLogs({ action: action.trim() || undefined, cursor });
    if (res.success) {
      setLogs(prev => [...prev, ...res.data.logs]);
      setCursor(res.data.nextCursor);
    }
    setLoadingMore(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchWrap}>
          <Ionicons name="filter" size={16} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            value={action}
            onChangeText={setAction}
            placeholder="Filter by action, e.g. SUSPENDED"
            placeholderTextColor="#9ca3af"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {action !== '' && (
            <Pressable onPress={() => setAction('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#c4c7cc" />
            </Pressable>
          )}
        </View>
      </View>

      {error !== '' && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.loadingList}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} style={styles.rowSkeleton} />
          ))}
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={l => l.id}
          contentContainerStyle={styles.listContent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={28} color="#c4c7cc" />
              <Text style={styles.emptyText}>No audit entries match this filter.</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator size="small" color="#6b7280" />
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const tone = toneFor(item.action);
            return (
              <View style={styles.row}>
                <View style={[styles.dot, styles[`dot_${tone}`]]} />
                <View style={styles.rowText}>
                  <Text style={styles.action}>{item.action}</Text>
                  <Text style={styles.actor} numberOfLines={1}>
                    {item.actorEmail}
                    {item.targetType ? ` · ${item.targetType}` : ''}
                  </Text>
                  <Text style={styles.meta}>
                    {formatDateTime(item.createdAt)}
                    {item.ipAddress ? ` · ${item.ipAddress}` : ''}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },

  header: { padding: 16, paddingBottom: 8 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fafafa',
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: '#0f172a' },

  loadingList: { padding: 16, gap: 10 },
  rowSkeleton: { height: 64, borderRadius: 10 },
  listContent: { padding: 16, paddingTop: 8, paddingBottom: 40 },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  dot_danger: { backgroundColor: '#dc2626' },
  dot_success: { backgroundColor: '#16a34a' },
  dot_neutral: { backgroundColor: '#c4c7cc' },
  rowText: { flex: 1 },
  action: { fontSize: 13.5, fontWeight: '700', color: '#0f172a', letterSpacing: 0.2 },
  actor: { fontSize: 12.5, color: '#374151', marginTop: 2 },
  meta: { fontSize: 12, color: '#9ca3af', marginTop: 2 },

  footer: { paddingVertical: 20, alignItems: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 48 },
  emptyText: { fontSize: 14, color: '#9ca3af' },
  error: { fontSize: 14, fontWeight: '600', color: '#b91c1c', paddingHorizontal: 16, paddingBottom: 8 },
});
