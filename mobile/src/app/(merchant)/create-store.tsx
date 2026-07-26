import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/lib/auth';
import { checkSubdomain, createShop } from '@/lib/shops-api';

type SubStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

// Store creation (Merchant stack). Mirrors the web CreateShopForm: name +
// subdomain (with live availability check) + description. POST /shops creates
// shop + default theme + COD atomically. Because that call rotates the session
// (new token via cookie only), native clients re-authenticate afterward.
export default function CreateStoreScreen() {
  const router = useRouter();
  const { merchant, beginReauth } = useAuth();

  const [name, setName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [subdomainEdited, setSubdomainEdited] = useState(false);
  const [description, setDescription] = useState('');

  const [subStatus, setSubStatus] = useState<SubStatus>('idle');
  const [subMessage, setSubMessage] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdName, setCreatedName] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Auto-suggest the subdomain from the store name until the user edits it.
  useEffect(() => {
    if (subdomainEdited) return;
    const suggested = slugify(name);
    setSubdomain(suggested);
  }, [name, subdomainEdited]);

  // Debounced availability check.
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (subdomain.length < 3) {
      setSubStatus(subdomain.length === 0 ? 'idle' : 'invalid');
      setSubMessage(subdomain.length === 0 ? '' : 'Must be at least 3 characters');
      return;
    }
    setSubStatus('checking');
    debounceRef.current = setTimeout(async () => {
      const res = await checkSubdomain(subdomain);
      if (res.success) {
        setSubStatus(res.data.available ? 'available' : 'taken');
        setSubMessage(res.data.message);
      } else {
        setSubStatus('idle');
      }
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [subdomain]);

  const onChangeSubdomain = (raw: string) => {
    setSubdomainEdited(true);
    setSubdomain(raw.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  };

  const canSubmit =
    name.trim().length >= 2 && subdomain.length >= 3 && subStatus !== 'taken' && subStatus !== 'invalid' && !submitting;

  const onSubmit = async () => {
    setError('');
    if (name.trim().length < 2) return setError('Store name must be at least 2 characters.');
    if (subdomain.length < 3) return setError('Choose a subdomain (at least 3 characters).');
    if (subStatus === 'taken') return setError('That subdomain is taken — pick another.');

    setSubmitting(true);
    const res = await createShop({
      subdomain,
      name: name.trim(),
      description: description.trim() || undefined,
    });
    setSubmitting(false);
    if (res.success) setCreatedName(res.data.shop.name);
    else setError(res.error.message);
  };

  const goSignIn = async () => {
    await beginReauth(
      merchant?.email ?? '',
      `Your store "${createdName}" is ready — sign in to open your dashboard.`,
    );
    router.back();
  };

  if (createdName) {
    return (
      <View style={styles.doneWrap}>
        <Ionicons name="checkmark-circle" size={48} color="#047857" />
        <Text style={styles.doneTitle}>Store created!</Text>
        <Text style={styles.doneText}>
          <Text style={styles.strong}>{createdName}</Text> is set up with Cash on Delivery enabled. For security
          we need you to sign in again to open your dashboard — then you can add products and publish.
        </Text>
        <Pressable style={[styles.button, styles.doneButton]} onPress={goSignIn}>
          <Text style={styles.buttonText}>Sign in to continue</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>You&apos;re one step from selling online.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Store name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Dhaka Crafts"
            placeholderTextColor="#9ca3af"
            editable={!submitting}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Subdomain</Text>
          <View style={styles.subRow}>
            <TextInput
              style={[styles.input, styles.subInput]}
              value={subdomain}
              onChangeText={onChangeSubdomain}
              placeholder="your-store"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
            />
            <Text style={styles.subSuffix}>.bazarhq.com</Text>
          </View>
          {subStatus === 'checking' && <Text style={styles.hint}>Checking availability…</Text>}
          {subStatus === 'available' && <Text style={styles.hintOk}>✓ {subMessage}</Text>}
          {(subStatus === 'taken' || subStatus === 'invalid') && <Text style={styles.hintBad}>{subMessage}</Text>}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={description}
            onChangeText={setDescription}
            placeholder="What do you sell?"
            placeholderTextColor="#9ca3af"
            multiline
            textAlignVertical="top"
            editable={!submitting}
          />
        </View>

        {error !== '' && <Text style={styles.error}>{error}</Text>}

        <Pressable style={[styles.button, !canSubmit && styles.disabled]} onPress={onSubmit} disabled={!canSubmit}>
          {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Create store</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 20, paddingBottom: 40 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 18 },

  field: { gap: 6, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#fafafa',
  },
  textarea: { minHeight: 88 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subInput: { flex: 1 },
  subSuffix: { fontSize: 14, color: '#9ca3af' },
  hint: { fontSize: 13, color: '#6b7280' },
  hintOk: { fontSize: 13, color: '#047857', fontWeight: '600' },
  hintBad: { fontSize: 13, color: '#b91c1c', fontWeight: '600' },
  error: { fontSize: 14, fontWeight: '600', color: '#b91c1c', marginBottom: 12 },

  button: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },

  doneWrap: { flex: 1, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  doneTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  doneText: { fontSize: 15, color: '#374151', textAlign: 'center', lineHeight: 22 },
  strong: { fontWeight: '700', color: '#0f172a' },
  doneButton: { alignSelf: 'stretch', marginTop: 12 },
});
