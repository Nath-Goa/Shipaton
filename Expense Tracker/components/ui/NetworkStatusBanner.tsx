import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedbackPressable as Pressable } from '@/components/ui/FeedbackPressable';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';

export function NetworkStatusBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const update = () => setOnline(window.navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (online) return null;
  return (
    <View style={[styles.banner, { top: insets.top, backgroundColor: colors.warning }]}>
      <Text style={styles.text}>Offline — showing saved or simulated data</Text>
      <Pressable feedbackCategory="selection" onPress={() => setOnline(window.navigator.onLine)}>
        <Text style={styles.retry}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', left: spacing.md, right: spacing.md, zIndex: 1000, minHeight: 38, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md },
  text: { color: '#fff', fontSize: 11.5, letterSpacing: trackingFor(11.5), fontWeight: '700', flex: 1 },
  retry: { color: '#fff', fontSize: 11.5, letterSpacing: trackingFor(11.5), fontWeight: '900', marginLeft: spacing.md },
});

