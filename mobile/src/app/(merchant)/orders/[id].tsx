import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import Skeleton from '@/components/Skeleton';
import {
  fetchOrder,
  formatTk,
  PAYMENT_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  updateOrderStatus,
  VALID_TRANSITIONS,
  type OrderDetail,
  type SettableStatus,
} from '@/lib/orders-api';

// Order detail (Sprint C). Items, customer/delivery/payment, totals, timeline,
// and status updates limited to VALID_TRANSITIONS for the current status (so a
// shipped order only offers "Mark Delivered", never Cancel). Confirming a change
// PATCHes /orders/:id/status; the API enforces the transition and restores stock
// on cancel. Inside the Merchant stack — back returns to the orders list.

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [pendingStatus, setPendingStatus] = useState<SettableStatus | null>(null);
  const [note, setNote] = useState('');
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchOrder(id).then(res => {
      if (!active) return;
      if (res.success) setOrder(res.data.order);
      else setNotFound(true);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [id]);

  const confirmUpdate = async () => {
    if (!pendingStatus || !order) return;
    setUpdating(true);
    setError('');
    const res = await updateOrderStatus(order.id, pendingStatus, note.trim() || undefined);
    setUpdating(false);
    if (res.success) {
      setOrder(res.data.order);
      setPendingStatus(null);
      setNote('');
    } else {
      setError(res.error.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <Skeleton style={styles.skLine} />
        <Skeleton style={styles.skBlock} />
        <Skeleton style={styles.skBlock} />
        <Skeleton style={styles.skBlock} />
      </View>
    );
  }

  if (notFound || !order) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Order not found.</Text>
      </View>
    );
  }

  const color = STATUS_COLORS[order.status] ?? '#6b7280';
  const allowed = VALID_TRANSITIONS[order.status] ?? [];

  return (
    <>
      <Stack.Screen options={{ title: `#${order.orderNumber}` }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Status + actions */}
        <View style={styles.statusRow}>
          <Text style={[styles.statusBadge, { color, backgroundColor: color + '20' }]}>
            {STATUS_LABELS[order.status] ?? order.status}
          </Text>
          <Text style={styles.date}>
            {new Date(order.createdAt).toLocaleString('en-BD', {
              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </Text>
        </View>

        {allowed.length > 0 && (
          <View style={styles.actions}>
            {allowed.map(s => {
              const danger = s === 'cancelled';
              return (
                <Pressable
                  key={s}
                  style={[styles.actionBtn, danger ? styles.actionDanger : styles.actionPrimary]}
                  onPress={() => { setPendingStatus(s); setNote(''); setError(''); }}
                >
                  <Text style={danger ? styles.actionDangerText : styles.actionPrimaryText}>
                    {danger ? 'Cancel order' : `Mark ${STATUS_LABELS[s]}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Items */}
        <Section title="Items">
          {order.items.map(item => (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>
                  {item.productName}
                  {item.variantName ? <Text style={styles.itemVariant}>  ·  {item.variantName}</Text> : null}
                </Text>
                <Text style={styles.itemMeta}>{formatTk(item.unitPrice)} × {item.quantity}</Text>
              </View>
              <Text style={styles.itemSubtotal}>{formatTk(item.subtotal)}</Text>
            </View>
          ))}
          <View style={styles.totalsDivider} />
          <TotalRow label="Subtotal" value={formatTk(order.subtotal)} />
          <TotalRow label="Shipping" value={Number(order.shippingFee) === 0 ? 'Free' : formatTk(order.shippingFee)} />
          <TotalRow label="Total" value={formatTk(order.total)} bold />
        </Section>

        {/* Customer */}
        <Section title="Customer">
          <Text style={styles.strong}>{order.customerName}</Text>
          <Text style={styles.body}>{order.customerPhone}</Text>
          {order.customerEmail ? <Text style={styles.body}>{order.customerEmail}</Text> : null}
        </Section>

        {/* Delivery */}
        <Section title="Delivery address">
          <Text style={styles.body}>{order.shippingAddress.line1}</Text>
          {order.shippingAddress.line2 ? <Text style={styles.body}>{order.shippingAddress.line2}</Text> : null}
          <Text style={styles.body}>{order.shippingAddress.city}, {order.shippingAddress.district}</Text>
        </Section>

        {/* Payment */}
        <Section title="Payment">
          <Text style={styles.body}>{PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}</Text>
          <Text style={styles.body}>Status: {order.paymentStatus}</Text>
          {order.transactionId ? <Text style={styles.body}>TxID: {order.transactionId}</Text> : null}
        </Section>

        {/* Notes */}
        {order.notes ? (
          <Section title="Customer notes">
            <Text style={styles.body}>{order.notes}</Text>
          </Section>
        ) : null}

        {/* Timeline */}
        <Section title="Timeline">
          {order.timeline.map(entry => {
            const dot = STATUS_COLORS[entry.status] ?? '#6b7280';
            return (
              <View key={entry.id} style={styles.timelineEntry}>
                <View style={[styles.timelineDot, { backgroundColor: dot }]} />
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineStatus}>
                    {STATUS_LABELS[entry.status] ?? entry.status}
                    {entry.note ? <Text style={styles.timelineNote}> — {entry.note}</Text> : null}
                  </Text>
                  <Text style={styles.timelineTime}>
                    {new Date(entry.createdAt).toLocaleString('en-BD', {
                      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            );
          })}
        </Section>
      </ScrollView>

      {/* Status update modal */}
      <Modal visible={pendingStatus !== null} transparent animationType="fade" onRequestClose={() => setPendingStatus(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => !updating && setPendingStatus(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {pendingStatus === 'cancelled' ? 'Cancel order?' : `Mark as ${pendingStatus ? STATUS_LABELS[pendingStatus] : ''}`}
            </Text>
            <TextInput
              style={styles.modalNote}
              placeholder={pendingStatus === 'cancelled' ? 'Reason for cancellation (optional)' : 'Add a note (optional)'}
              placeholderTextColor="#9ca3af"
              value={note}
              onChangeText={setNote}
              multiline
              textAlignVertical="top"
            />
            {error !== '' && <Text style={styles.modalError}>{error}</Text>}
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, styles.modalCancel]} onPress={() => setPendingStatus(null)} disabled={updating}>
                <Text style={styles.modalCancelText}>Back</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, pendingStatus === 'cancelled' ? styles.modalDanger : styles.modalConfirm, updating && styles.disabled]}
                onPress={confirmUpdate}
                disabled={updating}
              >
                {updating ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.modalConfirmText}>Confirm</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, bold && styles.totalBold]}>{label}</Text>
      <Text style={[styles.totalValue, bold && styles.totalBold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  muted: { fontSize: 15, color: '#6b7280' },
  loading: { flex: 1, backgroundColor: '#ffffff', padding: 20, gap: 12 },
  skLine: { height: 18, width: '40%' },
  skBlock: { height: 100, borderRadius: 12 },

  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  statusBadge: {
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  date: { fontSize: 13, color: '#9ca3af' },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  actionBtn: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10 },
  actionPrimary: { backgroundColor: '#0f172a' },
  actionPrimaryText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  actionDanger: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#fecaca' },
  actionDangerText: { color: '#b91c1c', fontSize: 15, fontWeight: '700' },

  section: {
    borderWidth: 1,
    borderColor: '#ececed',
    borderRadius: 12,
    padding: 16,
    marginTop: 14,
    backgroundColor: '#fafafa',
    gap: 6,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  strong: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  body: { fontSize: 14, color: '#374151', lineHeight: 20 },

  itemRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
  itemInfo: { flex: 1, gap: 2 },
  itemName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  itemVariant: { fontSize: 13, fontWeight: '400', color: '#6b7280' },
  itemMeta: { fontSize: 13, color: '#6b7280' },
  itemSubtotal: { fontSize: 14, fontWeight: '700', color: '#0f172a' },

  totalsDivider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalLabel: { fontSize: 14, color: '#6b7280' },
  totalValue: { fontSize: 14, color: '#0f172a' },
  totalBold: { fontSize: 16, fontWeight: '800', color: '#0f172a' },

  timelineEntry: { flexDirection: 'row', gap: 10, paddingVertical: 6 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  timelineContent: { flex: 1, gap: 2 },
  timelineStatus: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  timelineNote: { fontSize: 14, fontWeight: '400', color: '#6b7280' },
  timelineTime: { fontSize: 12, color: '#9ca3af' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 20, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalNote: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fafafa',
    minHeight: 72,
  },
  modalError: { fontSize: 14, fontWeight: '600', color: '#b91c1c' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  modalBtn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  modalCancel: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
  modalCancelText: { color: '#374151', fontSize: 15, fontWeight: '700' },
  modalConfirm: { backgroundColor: '#0f172a' },
  modalDanger: { backgroundColor: '#b91c1c' },
  modalConfirmText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
