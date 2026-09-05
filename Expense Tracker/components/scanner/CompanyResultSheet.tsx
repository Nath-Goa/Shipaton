import { Ionicons } from '@expo/vector-icons';
import { FlatList, Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { PillBadge } from '@/components/ui/PillBadge';
import { Text } from '@/components/ui/Text';
import { springs } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

// Opens as a small collapsed "blob" (just the top guess, peeking up from the
// bottom) — drag it up to expand into full candidate cards, swipe
// horizontally between them. The vertical drag (collapse <-> expand) and the
// horizontal swipe (between candidates) are two separate gesture systems on
// two separate views (the handle vs. the FlatList below it) so they never
// fight each other — no custom horizontal-swipe math needed, a native
// paging FlatList already does that reliably (same technique used for the
// News tab's card feed).

export type ScannerCandidate = {
  name: string;
  confidence: number;
  reason: string;
  /** Resolved against the app's tracked tickers — null means "not tracked here". */
  symbol: string | null;
};

const COLLAPSED_HEIGHT = 100;
const EXPANDED_HEIGHT_FRACTION = 0.6;

type Props = {
  photoUri: string;
  candidates: ScannerCandidate[];
  onViewStock: (symbol: string) => void;
  onDismiss: () => void;
};

export function CompanyResultSheet({ photoUri, candidates, onViewStock, onDismiss }: Props) {
  const { colors } = useTheme();
  const { height: windowHeight, width } = useWindowDimensions();
  const expandedHeight = Math.round(windowHeight * EXPANDED_HEIGHT_FRACTION);
  const dragRange = expandedHeight - COLLAPSED_HEIGHT;

  // 0 = collapsed blob, 1 = fully expanded.
  const progress = useSharedValue(0);
  const dragStartProgress = useSharedValue(0);

  const pan = Gesture.Pan()
    .onStart(() => {
      dragStartProgress.value = progress.value;
    })
    .onUpdate((e) => {
      const delta = -e.translationY / dragRange;
      progress.value = Math.min(1, Math.max(0, dragStartProgress.value + delta));
    })
    .onEnd((e) => {
      const shouldExpand = progress.value > 0.4 || e.velocityY < -600;
      progress.value = withSpring(shouldExpand ? 1 : 0, springs.snappy);
    });

  const sheetStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [COLLAPSED_HEIGHT, expandedHeight], Extrapolation.CLAMP),
  }));

  const blobStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35], [1, 0], Extrapolation.CLAMP),
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.35, 1], [0, 1], Extrapolation.CLAMP),
  }));

  const top = candidates[0];

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="box-none">
      <Animated.View
        style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }, sheetStyle]}>
        <GestureDetector gesture={pan}>
          <View style={styles.handleArea}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <Animated.View style={[styles.blobRow, blobStyle]} pointerEvents="none">
              <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
                <Text style={[styles.avatarLetter, { color: colors.accent }]}>
                  {(top?.name ?? '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.blobText}>
                <Text style={[styles.blobName, { color: colors.text }]} numberOfLines={1}>
                  {top ? top.name : 'No match found'}
                </Text>
                <Text style={[styles.blobHint, { color: colors.text3 }]}>Pull up to see more</Text>
              </View>
              <Ionicons name="chevron-up" size={18} color={colors.text3} />
            </Animated.View>
          </View>
        </GestureDetector>

        <Animated.View style={[styles.expandedContent, contentStyle]}>
          {candidates.length === 0 ? (
            <View style={[styles.candidateCard, { width }]}>
              <Text style={[styles.candidateName, { color: colors.text }]}>Couldn&apos;t identify this one</Text>
              <Text style={[styles.candidateReason, { color: colors.text2 }]}>
                Try a clearer, closer photo of a logo or label.
              </Text>
            </View>
          ) : (
            <FlatList
              data={candidates}
              keyExtractor={(c, i) => `${c.name}-${i}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={[styles.candidateCard, { width }]}>
                  <Image source={{ uri: photoUri }} style={[styles.photo, { backgroundColor: colors.surface2 }]} />
                  <Text style={[styles.candidateName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.candidateReason, { color: colors.text2 }]}>{item.reason}</Text>
                  <PillBadge label={`${Math.round(item.confidence * 100)}% confidence`} />
                  {item.symbol ? (
                    <Button label={`View ${item.symbol} stock`} onPress={() => onViewStock(item.symbol!)} />
                  ) : (
                    <Text style={[styles.notTracked, { color: colors.text3 }]}>Not a tracked stock in this app</Text>
                  )}
                </View>
              )}
            />
          )}
          {candidates.length > 1 ? (
            <Text style={[styles.swipeHint, { color: colors.text3 }]}>Swipe for the next guess</Text>
          ) : null}
        </Animated.View>

        <Pressable style={styles.closeBtn} onPress={onDismiss} hitSlop={10}>
          <Ionicons name="close" size={20} color={colors.text3} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  handleArea: { paddingTop: spacing.sm, paddingHorizontal: spacing.xl },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: spacing.md },
  blobRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 17, fontWeight: '700' },
  blobText: { flex: 1 },
  blobName: { fontSize: 15, fontWeight: '700' },
  blobHint: { fontSize: 11.5, marginTop: 1 },
  expandedContent: { flex: 1 },
  candidateCard: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xl, gap: spacing.sm },
  photo: { width: '100%', height: 140, borderRadius: radius.sm, marginBottom: spacing.sm },
  candidateName: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  candidateReason: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  notTracked: { fontSize: 12.5, marginTop: spacing.sm },
  swipeHint: { textAlign: 'center', fontSize: 11.5, paddingBottom: spacing.md },
  closeBtn: { position: 'absolute', top: spacing.sm, right: spacing.md, padding: spacing.xs },
});
