import * as SecureStore from 'expo-secure-store';

// The merchant JWT is kept in the OS keystore (Android Keystore / iOS Keychain)
// via expo-secure-store — NOT AsyncStorage and never an EXPO_PUBLIC_* var, which
// would be baked into the APK. This is the only place the token is persisted.
const MERCHANT_TOKEN_KEY = 'bazarhq.merchant.jwt';

// The admin JWT is a separate credential with a much shorter life (8h absolute,
// 30-minute inactivity) and far broader authority, so it gets its own key and is
// cleared independently of the merchant token.
const ADMIN_TOKEN_KEY = 'bazarhq.admin.jwt';

export async function getMerchantToken(): Promise<string | null> {
  return SecureStore.getItemAsync(MERCHANT_TOKEN_KEY);
}

export async function setMerchantToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(MERCHANT_TOKEN_KEY, token);
}

export async function clearMerchantToken(): Promise<void> {
  await SecureStore.deleteItemAsync(MERCHANT_TOKEN_KEY);
}

export async function getAdminToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ADMIN_TOKEN_KEY);
}

export async function setAdminToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(ADMIN_TOKEN_KEY, token);
}

export async function clearAdminToken(): Promise<void> {
  await SecureStore.deleteItemAsync(ADMIN_TOKEN_KEY);
}
