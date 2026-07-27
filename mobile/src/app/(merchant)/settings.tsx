import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import Skeleton from '@/components/Skeleton';
import { api } from '@/lib/api-client';
import {
  fetchPaymentConfigs,
  updatePaymentConfig,
  type PaymentConfig,
  type PaymentMethod,
} from '@/lib/settings-api';

const METHODS: PaymentMethod[] = ['cod', 'bkash', 'nagad'];
const LABELS: Record<PaymentMethod, string> = { cod: 'Cash on Delivery', bkash: 'bKash', nagad: 'Nagad' };
const DESCRIPTIONS: Record<PaymentMethod, string> = {
  cod: 'Collect payment when the order is delivered. No credentials needed.',
  bkash: 'Customers pay via bKash and submit their Transaction ID.',
  nagad: 'Customers pay via Nagad and submit their Transaction ID.',
};

interface ShopStatus {
  subdomain: string;
  status: string;
}

export default function SettingsScreen() {
  const [shop, setShop] = useState<ShopStatus | null>(null);
  const [configs, setConfigs] = useState<PaymentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [accountInputs, setAccountInputs] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState('');

  useEffect(() => {
    Promise.all([api.get<{ shop: ShopStatus }>('/shops/me'), fetchPaymentConfigs()]).then(([s, c]) => {
      if (s.success) setShop(s.data.shop);
      if (c.success) setConfigs(c.data.configs);
      setLoading(false);
    });
  }, []);

  const getConfig = (method: PaymentMethod): PaymentConfig =>
    configs.find(c => c.method === method) ?? { method, isEnabled: false, credentials: null };

  const flashMessage = (method: string, text: string) => {
    setMessages(prev => ({ ...prev, [method]: text }));
    setTimeout(() => setMessages(prev => { const n = { ...prev }; delete n[method]; return n; }), 3000);
  };

  const applyConfig = (config: PaymentConfig) =>
    setConfigs(prev => [...prev.filter(c => c.method !== config.method), config]);

  const toggle = async (method: PaymentMethod, current: boolean) => {
    setSaving(prev => ({ ...prev, [method]: true }));
    const body: { isEnabled: boolean; credentials?: { accountNumber: string } } = { isEnabled: !current };
    const input = accountInputs[method]?.trim();
    if (input && method !== 'cod') body.credentials = { accountNumber: input };
    const res = await updatePaymentConfig(method, body);
    if (res.success) {
      applyConfig(res.data.config);
      flashMessage(method, !current ? 'Enabled' : 'Disabled');
    } else {
      flashMessage(method, res.error.message);
    }
    setSaving(prev => ({ ...prev, [method]: false }));
  };

  const saveCredentials = async (method: PaymentMethod) => {
    const accountNumber = accountInputs[method]?.trim();
    if (!accountNumber) return flashMessage(method, 'Account number is required');
    setSaving(prev => ({ ...prev, [method]: true }));
    const res = await updatePaymentConfig(method, { isEnabled: getConfig(method).isEnabled, credentials: { accountNumber } });
    if (res.success) {
      applyConfig(res.data.config);
      setAccountInputs(prev => ({ ...prev, [method]: '' }));
      flashMessage(method, 'Account saved');
    } else {
      flashMessage(method, res.error.message);
    }
    setSaving(prev => ({ ...prev, [method]: false }));
  };

  const publish = async () => {
    setPublishing(true);
    setPublishMsg('');
    const res = await api.post<{ shop: ShopStatus }>('/shops/me/publish', {});
    if (res.success) setShop(res.data.shop);
    else setPublishMsg(res.error.message);
    setPublishing(false);
  };

  const enabledCount = configs.filter(c => c.isEnabled).length;
  const isPublished = shop?.status === 'published';

  if (loading) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Skeleton style={styles.blockSkeleton} />
        <Skeleton style={styles.blockSkeleton} />
        <Skeleton style={styles.blockSkeleton} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Payment methods</Text>
      {enabledCount === 0 && (
        <Text style={styles.warn}>Enable at least one payment method before you can publish.</Text>
      )}

      {METHODS.map(method => {
        const cfg = getConfig(method);
        const isNonCod = method !== 'cod';
        const savedAccount = cfg.credentials?.accountNumber;
        const busy = saving[method] ?? false;
        return (
          <View key={method} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.cardHeadText}>
                <Text style={styles.methodLabel}>{LABELS[method]}</Text>
                <Text style={styles.methodDesc}>{DESCRIPTIONS[method]}</Text>
                {savedAccount ? <Text style={styles.savedAccount}>Account: {savedAccount}</Text> : null}
              </View>
              <Switch
                value={cfg.isEnabled}
                onValueChange={() => toggle(method, cfg.isEnabled)}
                disabled={busy}
                trackColor={{ true: '#0f172a', false: '#d1d5db' }}
                thumbColor="#ffffff"
              />
            </View>

            {isNonCod && cfg.isEnabled && (
              <View style={styles.credRow}>
                <TextInput
                  style={styles.credInput}
                  value={accountInputs[method] ?? ''}
                  onChangeText={t => setAccountInputs(prev => ({ ...prev, [method]: t }))}
                  placeholder={savedAccount ? `Current: ${savedAccount}` : '01XXXXXXXXX'}
                  placeholderTextColor="#9ca3af"
                  keyboardType="number-pad"
                />
                <Pressable
                  style={[styles.credSave, (busy || !accountInputs[method]?.trim()) && styles.disabled]}
                  onPress={() => saveCredentials(method)}
                  disabled={busy || !accountInputs[method]?.trim()}
                >
                  <Text style={styles.credSaveText}>Save</Text>
                </Pressable>
              </View>
            )}

            {messages[method] ? <Text style={styles.methodMsg}>{messages[method]}</Text> : null}
          </View>
        );
      })}

      {/* Store status */}
      <Text style={[styles.sectionTitle, styles.sectionSpacer]}>Store status</Text>
      <View style={styles.card}>
        {isPublished ? (
          <Text style={styles.liveText}>● Your store is live at {shop?.subdomain}.bazarhq.com</Text>
        ) : (
          <>
            <Text style={styles.methodDesc}>Publish your store to make it visible to customers.</Text>
            {publishMsg ? <Text style={styles.warn}>{publishMsg}</Text> : null}
            <Pressable
              style={[styles.publishBtn, (publishing || enabledCount === 0) && styles.disabled]}
              onPress={publish}
              disabled={publishing || enabledCount === 0}
            >
              {publishing ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.publishText}>Publish store</Text>}
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 16, paddingBottom: 40 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  sectionSpacer: { marginTop: 22 },
  warn: { fontSize: 13, color: '#b45309', fontWeight: '600', marginBottom: 10 },

  card: { borderWidth: 1, borderColor: '#ececed', borderRadius: 12, padding: 16, marginBottom: 10, backgroundColor: '#fafafa' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardHeadText: { flex: 1, gap: 3 },
  methodLabel: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  methodDesc: { fontSize: 13, color: '#6b7280', lineHeight: 18 },
  savedAccount: { fontSize: 13, color: '#374151', marginTop: 2 },

  credRow: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
  credInput: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#0f172a', backgroundColor: '#ffffff' },
  credSave: { backgroundColor: '#0f172a', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11 },
  credSaveText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  methodMsg: { fontSize: 13, color: '#047857', fontWeight: '600', marginTop: 8 },

  liveText: { fontSize: 14, fontWeight: '700', color: '#047857' },
  publishBtn: { backgroundColor: '#0f172a', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
  publishText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },

  blockSkeleton: { height: 96, borderRadius: 12, marginBottom: 12 },
});
