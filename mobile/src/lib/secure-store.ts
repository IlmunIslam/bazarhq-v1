import * as SecureStore from 'expo-secure-store';

// The merchant JWT is kept in the OS keystore (Android Keystore / iOS Keychain)
// via expo-secure-store — NOT AsyncStorage and never an EXPO_PUBLIC_* var, which
// would be baked into the APK. This is the only place the token is persisted.
const MERCHANT_TOKEN_KEY = 'bazarhq.merchant.jwt';

export async function getMerchantToken(): Promise<string | null> {
  return SecureStore.getItemAsync(MERCHANT_TOKEN_KEY);
}

export async function setMerchantToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(MERCHANT_TOKEN_KEY, token);
}

export async function clearMerchantToken(): Promise<void> {
  await SecureStore.deleteItemAsync(MERCHANT_TOKEN_KEY);
}
