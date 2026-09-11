import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const PIN_STORAGE_KEY = 'app_lock_security_pin';

// Web in-memory fallback since SecureStore is native-only
let webPinMemory: string | null = null;

export type BiometricType = 'face' | 'fingerprint' | 'none';

export type BiometricCapabilities = {
  hasHardware: boolean;
  isEnrolled: boolean;
  biometricType: BiometricType;
  label: string;
};

/**
 * Inspects device biometric sensors and enrollment status.
 */
export async function getBiometricCapabilities(): Promise<BiometricCapabilities> {
  if (Platform.OS === 'web') {
    return {
      hasHardware: false,
      isEnrolled: false,
      biometricType: 'none',
      label: 'Biometrics',
    };
  }

  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = hasHardware && (await LocalAuthentication.isEnrolledAsync());
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

    let biometricType: BiometricType = 'none';
    let label = 'Biometrics';

    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      biometricType = 'face';
      label = Platform.OS === 'ios' ? 'Face ID' : 'Face Unlock';
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      biometricType = 'fingerprint';
      label = Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
    } else if (hasHardware && isEnrolled) {
      biometricType = 'fingerprint';
      label = 'Biometrics';
    }

    return {
      hasHardware,
      isEnrolled,
      biometricType,
      label,
    };
  } catch {
    return {
      hasHardware: false,
      isEnrolled: false,
      biometricType: 'none',
      label: 'Biometrics',
    };
  }
}

/**
 * Securely saves the 4-digit or 6-digit PIN.
 */
export async function saveStoredPin(pin: string): Promise<boolean> {
  const trimmed = pin.trim();
  if (Platform.OS === 'web') {
    webPinMemory = trimmed;
    return true;
  }

  try {
    await SecureStore.setItemAsync(PIN_STORAGE_KEY, trimmed);
    return true;
  } catch (error) {
    console.warn('Failed to save PIN in SecureStore:', error);
    return false;
  }
}

/**
 * Retrieves the stored PIN.
 */
export async function getStoredPin(): Promise<string | null> {
  if (Platform.OS === 'web') return webPinMemory;

  try {
    return await SecureStore.getItemAsync(PIN_STORAGE_KEY);
  } catch {
    return null;
  }
}

// In-memory brute-force guard — verifyPin was previously a bare comparison,
// letting all 10,000 4-digit PINs be tried instantly against an unlocked
// phone. Resets on app restart (acceptable: the point is slowing down a
// live guessing attempt while the phone is in someone's hands, not
// surviving a process restart).
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 30_000;
let failedPinAttempts = 0;
let pinLockedUntil = 0;

/**
 * Milliseconds remaining in the current lockout, or 0 if not locked out.
 */
export function getPinLockoutRemainingMs(): number {
  return Math.max(0, pinLockedUntil - Date.now());
}

/**
 * Verifies if the candidate PIN matches the stored PIN.
 */
export async function verifyPin(candidate: string): Promise<boolean> {
  if (Date.now() < pinLockedUntil) return false;

  const stored = await getStoredPin();
  if (!stored) return false;
  const matches = stored === candidate.trim();

  if (matches) {
    failedPinAttempts = 0;
    pinLockedUntil = 0;
  } else {
    failedPinAttempts += 1;
    if (failedPinAttempts >= MAX_PIN_ATTEMPTS) {
      pinLockedUntil = Date.now() + PIN_LOCKOUT_MS;
      failedPinAttempts = 0;
    }
  }
  return matches;
}

/**
 * Checks if a PIN has been set up.
 */
export async function hasStoredPin(): Promise<boolean> {
  const stored = await getStoredPin();
  return Boolean(stored && stored.length >= 4);
}

/**
 * Deletes the stored PIN.
 */
export async function clearStoredPin(): Promise<void> {
  if (Platform.OS === 'web') {
    webPinMemory = null;
    return;
  }

  try {
    await SecureStore.deleteItemAsync(PIN_STORAGE_KEY);
  } catch {
    // Graceful ignore
  }
}

/**
 * Triggers biometric prompt with fallback to PIN handling.
 */
export async function authenticateWithBiometrics(promptMessage = 'Unlock App'): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Use PIN',
      cancelLabel: 'Cancel',
      disableDeviceFallback: true, // Let our app manage PIN fallback
    });
    return result.success;
  } catch {
    return false;
  }
}
