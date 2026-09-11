import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { PillBadge } from '@/components/ui/PillBadge';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { springs, triggerFeedback } from '@/constants/animations';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/hooks/useTheme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// A real, specific, checked YouTube video per course (constants/courses.ts's
// visual.videoId) — not a search query, not embedded. Opens externally via
// Linking rather than an inline WebView player, which would need a new
// native dependency (react-native-webview) on top of expo-speech's; this
// works today, no build required. The thumbnail comes straight from
// YouTube's public image CDN (no API key, no extra fetch/library needed).
type Props = { videoId: string; title: string; source: string };

export function VideoCard({ videoId, title, source }: Props) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = reducedMotion ? 1 : withSpring(0.98, springs.tap);
    triggerFeedback('navigation');
  }, [scale, reducedMotion]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, springs.tap);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePress() {
    Linking.openURL(`https://www.youtube.com/watch?v=${videoId}`);
  }

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, animatedStyle]}>
      <View style={styles.thumbWrap}>
        <Image source={{ uri: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` }} style={styles.thumb} resizeMode="cover" />
        <View style={[styles.playBadge, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
          <Ionicons name="play" size={22} color="#fff" />
        </View>
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.metaRow}>
          <PillBadge label={source} />
          <Text style={[styles.watchHint, { color: colors.text3 }]}>Watch on YouTube ↗</Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, overflow: 'hidden' },
  thumbWrap: { aspectRatio: 16 / 9, position: 'relative' },
  thumb: { width: '100%', height: '100%' },
  playBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 44,
    height: 44,
    borderRadius: 22,
    marginTop: -22,
    marginLeft: -22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { padding: spacing.md, gap: spacing.xs },
  title: { fontSize: 14, fontWeight: '700', letterSpacing: trackingFor(14) },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  watchHint: { fontSize: 11.5, fontWeight: '600', letterSpacing: trackingFor(11.5) },
});
