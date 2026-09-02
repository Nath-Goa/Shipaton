import { Alert, Platform } from 'react-native';

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
};

// Alert.alert with multiple buttons isn't reliably supported by
// react-native-web (varies by version, sometimes a silent no-op) — fall back
// to window.confirm there. Native iOS/Android always uses the real Alert.
export function confirmAction(options: ConfirmOptions, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    const text = options.message ? `${options.title}\n\n${options.message}` : options.title;
    // eslint-disable-next-line no-alert
    if (window.confirm(text)) onConfirm();
    return;
  }
  Alert.alert(options.title, options.message, [
    { text: 'Cancel', style: 'cancel' },
    { text: options.confirmLabel ?? 'OK', style: options.destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
