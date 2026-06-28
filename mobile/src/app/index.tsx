import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, API_BASE_URL } from '@/lib/api-client';

// Minimal shape of the bits of GET /storefront/:subdomain we read for the proof.
interface StorefrontResponse {
  shop: { name: string; subdomain: string };
}

// A known published shop on the production API (same one used by the web app).
const PROOF_SUBDOMAIN = 'alvi-s-store';

type ProofState =
  | { status: 'loading' }
  | { status: 'ok'; shopName: string }
  | { status: 'error'; message: string };

export default function CustomerScreen() {
  const [state, setState] = useState<ProofState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    api
      .get<StorefrontResponse>(`/storefront/${PROOF_SUBDOMAIN}`)
      .then((res) => {
        if (!active) return;
        if (res.success) setState({ status: 'ok', shopName: res.data.shop.name });
        else setState({ status: 'error', message: res.error.message });
      })
      .catch((e) => {
        if (active) setState({ status: 'error', message: String(e?.message ?? e) });
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.kicker}>Customer · Sprint 0</Text>
      <Text style={styles.title}>BazarHQ Mobile</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>API connectivity proof</Text>

        {state.status === 'loading' && <ActivityIndicator />}

        {state.status === 'ok' && (
          <Text style={styles.ok}>Connected — shop: {state.shopName}</Text>
        )}

        {state.status === 'error' && (
          <Text style={styles.error}>Error: {state.message}</Text>
        )}

        <Text style={styles.meta}>
          GET {API_BASE_URL}/storefront/{PROOF_SUBDOMAIN}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 8, backgroundColor: '#ffffff' },
  kicker: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, color: '#6b7280', textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '800', color: '#0f172a', marginBottom: 16 },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    backgroundColor: '#fafafa',
  },
  cardLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  ok: { fontSize: 16, fontWeight: '700', color: '#047857' },
  error: { fontSize: 14, fontWeight: '600', color: '#b91c1c' },
  meta: { fontSize: 11, color: '#9ca3af' },
});
