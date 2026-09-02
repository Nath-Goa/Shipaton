import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import type { AiProvider } from '@/types/ai';

// Every provider's key is BYOK (bring your own key): a mobile client can't
// safely embed a secret key in the bundle, so the user pastes their own key
// in Settings and it is kept only in the OS-level secure store — never in
// AsyncStorage or any persisted Zustand state. Each provider gets its own
// slot so switching providers doesn't clobber the others' saved keys.
function keyName(provider: AiProvider): string {
  return `${provider}_api_key`;
}

// expo-secure-store isn't available on web; fall back to an in-memory map so
// the web preview (used for development/screenshots) still works, with no
// persistence across reloads there.
const webMemoryValues = new Map<AiProvider, string>();

export async function getApiKey(provider: AiProvider): Promise<string | null> {
  if (Platform.OS === 'web') return webMemoryValues.get(provider) ?? null;
  try {
    return await SecureStore.getItemAsync(keyName(provider));
  } catch {
    return null;
  }
}

export async function setApiKey(provider: AiProvider, value: string): Promise<void> {
  const trimmed = value.trim();
  if (Platform.OS === 'web') {
    webMemoryValues.set(provider, trimmed);
    return;
  }
  await SecureStore.setItemAsync(keyName(provider), trimmed);
}

export async function clearApiKey(provider: AiProvider): Promise<void> {
  if (Platform.OS === 'web') {
    webMemoryValues.delete(provider);
    return;
  }
  await SecureStore.deleteItemAsync(keyName(provider));
}

export function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 6)}••••${key.slice(-4)}`;
}
