import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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

// Merchant registration (Merchant stack). Mirrors the web register flow: creates
// the account, then shows an "awaiting verification" state — new accounts can't
// log in until verified (403 EMAIL_NOT_VERIFIED). We never bypass that; in
// production verification is done by a superadmin.
export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async () => {
    setError('');
    if (fullName.trim().length < 2) return setError('Please enter your full name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError("Passwords don't match.");

    setSubmitting(true);
    const res = await register(fullName.trim(), email.trim(), phone, password);
    setSubmitting(false);
    if (res.ok) setDone(true);
    else setError(res.message ?? 'Could not create your account.');
  };

  if (done) {
    return (
      <View style={styles.doneWrap}>
        <Ionicons name="mail-unread-outline" size={44} color="#0f172a" />
        <Text style={styles.doneTitle}>Check your email</Text>
        <Text style={styles.doneText}>
          We&apos;ve sent a verification link to <Text style={styles.strong}>{email.trim()}</Text>. Your account
          must be verified before you can log in. Once it&apos;s verified, come back and sign in to start
          building your store.
        </Text>
        <Pressable style={[styles.button, styles.backButton]} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Back to login</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>Free to start — create your merchant account.</Text>

        <Field label="Full name">
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your name"
            placeholderTextColor="#9ca3af"
            editable={!submitting}
          />
        </Field>
        <Field label="Email">
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            editable={!submitting}
          />
        </Field>
        <Field label="Phone (optional)">
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="01XXXXXXXXX"
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
            editable={!submitting}
          />
        </Field>
        <Field label="Password">
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Min 8 characters"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            editable={!submitting}
          />
        </Field>
        <Field label="Confirm password">
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Re-enter password"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            editable={!submitting}
            onSubmitEditing={onSubmit}
            returnKeyType="go"
          />
        </Field>

        {error !== '' && <Text style={styles.error}>{error}</Text>}

        <Pressable style={[styles.button, submitting && styles.disabled]} onPress={onSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Create account</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 20, paddingBottom: 40 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 18 },

  field: { gap: 6, marginBottom: 14 },
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
  backButton: { alignSelf: 'stretch', marginTop: 12 },
});
