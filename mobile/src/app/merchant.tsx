import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';

export default function MerchantScreen() {
  const { status, merchant, shop, logout } = useAuth();

  if (status === 'restoring') {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return status === 'authenticated' ? (
    <MerchantHome
      email={merchant?.email ?? ''}
      fullName={merchant?.fullName ?? ''}
      shopName={shop?.name ?? null}
      shopStatus={shop?.status ?? null}
      onLogout={logout}
    />
  ) : (
    <LoginForm />
  );
}

function LoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    const res = await login(email.trim(), password);
    if (!res.ok) {
      setError(res.message ?? 'Login failed. Please try again.');
      setSubmitting(false);
    }
    // On success the provider flips status → the authed view replaces this one.
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <Text style={styles.kicker}>Merchant · Sprint 1</Text>
        <Text style={styles.title}>Log in</Text>
        <Text style={styles.subtitle}>Use your BazarHQ merchant account.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
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
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            textContentType="password"
            editable={!submitting}
            onSubmitEditing={onSubmit}
            returnKeyType="go"
          />
        </View>

        {error !== '' && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Log In</Text>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MerchantHome({
  email,
  fullName,
  shopName,
  shopStatus,
  onLogout,
}: {
  email: string;
  fullName: string;
  shopName: string | null;
  shopStatus: string | null;
  onLogout: () => void;
}) {
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await onLogout();
    // Provider flips status → login view replaces this one.
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.kicker}>Merchant · Sprint 1</Text>
      <Text style={styles.title}>Welcome{fullName ? `, ${fullName}` : ''}</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Signed in as</Text>
        <Text style={styles.cardValue}>{email}</Text>

        <View style={styles.divider} />

        <Text style={styles.cardLabel}>Shop</Text>
        {shopName ? (
          <>
            <Text style={styles.cardValue}>{shopName}</Text>
            {shopStatus && <Text style={styles.badge}>{shopStatus}</Text>}
          </>
        ) : (
          <Text style={styles.muted}>No shop yet — create one on the web dashboard.</Text>
        )}
      </View>

      <Text style={styles.proof}>
        Authenticated via Bearer token (stored in the device keystore).
      </Text>

      <Pressable
        style={[styles.button, styles.logoutButton, loggingOut && styles.buttonDisabled]}
        onPress={handleLogout}
        disabled={loggingOut}
      >
        {loggingOut ? (
          <ActivityIndicator color="#b91c1c" />
        ) : (
          <Text style={styles.logoutText}>Log Out</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 8, backgroundColor: '#ffffff' },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  kicker: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  title: { fontSize: 28, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
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
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    gap: 6,
    backgroundColor: '#fafafa',
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardValue: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  divider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 10 },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    textTransform: 'capitalize',
  },
  muted: { fontSize: 14, color: '#6b7280' },
  proof: { fontSize: 12, color: '#9ca3af', marginTop: 16, marginBottom: 16 },
  logoutButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fecaca',
    marginTop: 'auto',
  },
  logoutText: { color: '#b91c1c', fontSize: 16, fontWeight: '700' },
});
