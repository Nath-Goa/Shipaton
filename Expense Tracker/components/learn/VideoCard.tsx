import { Ionicons } from '@expo/vector-icons';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';

import { PillBadge } from '@/components/ui/PillBadge';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { triggerFeedback } from '@/constants/animations';
import { useTheme } from '@/hooks/useTheme';

// A real, specific, checked YouTube video per course (constants/courses.ts's
// visual.videoId) — not a search query, not embedded. Opens externally via
// Linking rather than an inline WebView player, which would need a new
// native dependency (react-native-webview) on top of expo-speech's; this
// works today, no build required. The thumbnail comes straight from
// YouTube's public image CDN (no API key, no extra fetch/library needed).
type Props = { videoId: string; title: string; source: string };

export function VideoCard({ videoId, title, source }: Props) {
  const { colors } = useTheme();

  function handlePress() {
    triggerFeedback('navigation');
    Linking.openURL(`https://www.youtube.com/watch?v=${videoId}`);
  }

  return (
    <Pressable onPress={handlePress} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
    </Pressable>
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
  title: { fontSize: 14, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  watchHint: { fontSize: 11.5, fontWeight: '600' },
});
