import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Linking, StyleSheet, View, useWindowDimensions, type ViewToken } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { PriceChart } from '@/components/charts/PriceChart';
import { PillBadge } from '@/components/ui/PillBadge';
import { FeedbackPressable as Pressable } from '@/components/ui/FeedbackPressable';
import { Text } from '@/components/ui/Text';
import { springs } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { explainHeadlineCached, getCachedHeadlineExplanation } from '@/services/ai/learn';
import { getHistory, getQuote } from '@/services/marketData/marketData';
import { fetchHeadlines } from '@/services/news/newsFeed';
import { money, signedPct } from '@/utils/money';
import { nearestSnapPoint, projectMomentum, rubberband } from '@/utils/motion';
import type { NewsItem } from '@/types/prediction';

// Opens as a small collapsed "blob" (just the top guess, peeking up from the
// bottom) — drag it up to expand into full candidate cards, swipe
// horizontally between them. The vertical drag (collapse <-> expand) and the
// horizontal swipe (between candidates) are two separate gesture systems on
// two separate views (the handle vs. the FlatList below it) so they never
// fight each other — no custom horizontal-swipe math needed, a native
// paging FlatList already does that reliably (same technique used for the
// News tab's card feed). The FlatList's own `scrollEnabled` is additionally
// tied to the vertical drag's live state (isDragging below), so a swipe
// between candidates only ever takes effect once that "ongoing action" has
// actually finished — never mid-drag.

export type ScannerCandidate = {
  name: string;
  confidence: number;
  reason: string;
  /** Resolved against the app's tracked tickers — null means "not tracked here". */
  symbol: string | null;
};

const COLLAPSED_HEIGHT = 100;
const EXPANDED_HEIGHT_FRACTION = 0.6;
const NEWS_PER_CANDIDATE = 3;

type Props = {
  photoUri: string;
  candidates: ScannerCandidate[];
  onDismiss: () => void;
};

function HeadlineRow({ item, active }: { item: NewsItem; active: boolean }) {
  const { colors } = useTheme();
  const [explanation, setExplanation] = useState<string | null>(() => getCachedHeadlineExplanation(item));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active || explanation || loading) return;
    setLoading(true);
    explainHeadlineCached(item).then((result) => {
      setLoading(false);
      if (result.ok) setExplanation(result.data);
    });
    // active/item are the only real triggers — explanation/loading are read
    // as guards so a resolved fetch doesn't immediately refire itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, item]);

  return (
    <Pressable
      feedbackCategory="navigation"
      onPress={() => item.url && Linking.openURL(item.url)}
      style={[styles.newsRow, { borderColor: colors.border }]}>
      <Text style={[styles.newsTitle, { color: colors.text }]} numberOfLines={2}>
        {item.title}
      </Text>
      {explanation ? (
        <Text style={[styles.newsSummary, { color: colors.text3 }]} numberOfLines={3}>
          {explanation}
        </Text>
      ) : loading ? (
        <Text style={[styles.newsSummary, { color: colors.text3 }]}>Summarizing…</Text>
      ) : null}
    </Pressable>
  );
}

function CandidateOverview({ symbol, active }: { symbol: string; active: boolean }) {
  const { colors } = useTheme();
  const quote = getQuote(symbol);
  const bars = getHistory(symbol, '1M');
  const up = quote.changePct >= 0;

  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);

  useEffect(() => {
    // Only the currently active (paged-to) candidate fetches news — fetching
    // for every candidate up front would burst several requests at once,
    // exactly the pattern CLAUDE.md §5.4 documents as having broken live
    // prices before.
    if (!active || news !== null) return;
    setNewsLoading(true);
    fetchHeadlines(symbol, NEWS_PER_CANDIDATE).then((items) => {
      setNewsLoading(false);
      setNews(items);
    });
  }, [active, symbol, news]);

  return (
    <View style={styles.overviewBlock}>
      <View style={styles.priceRow}>
        <Text style={[styles.price, { color: colors.text }]}>{money(quote.price)}</Text>
        <Text style={[styles.change, { color: up ? colors.success : colors.danger }]}>{signedPct(quote.changePct)}</Text>
      </View>
      <PriceChart bars={bars} height={80} trend={up ? 'up' : 'down'} />

      {newsLoading && !news ? (
        <View style={styles.newsLoadingRow}>
          <ActivityIndicator size="small" color={colors.text3} />
          <Text style={[styles.newsSummary, { color: colors.text3 }]}>Loading news…</Text>
        </View>
      ) : news && news.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={[styles.newsHeading, { color: colors.text3 }]}>Related news</Text>
          {news.map((item) => (
            <HeadlineRow key={item.id} item={item} active={active} />
          ))}
        </View>
      ) : news && news.length === 0 ? (
        <Text style={[styles.newsSummary, { color: colors.text3 }]}>No recent headlines found.</Text>
      ) : null}
    </View>
  );
}

export function CompanyResultSheet({ photoUri, candidates, onDismiss }: Props) {
  const { colors } = useTheme();
  const { height: windowHeight, width } = useWindowDimensions();
  const expandedHeight = Math.round(windowHeight * EXPANDED_HEIGHT_FRACTION);
  const dragRange = expandedHeight - COLLAPSED_HEIGHT;

  // 0 = collapsed blob, 1 = fully expanded.
  const progress = useSharedValue(0);
  const dragStartProgress = useSharedValue(0);
  // Rubber-band "give" past 0/1, in px, added on top of the clamped height
  // interpolation below. Kept separate from `progress` itself because
  // `progress` still drives the [0,0.35]/[0.35,1] content-crossfade
  // thresholds via Extrapolation.CLAMP further down — if progress itself
  // were allowed to overshoot, that clamp would just hide the overshoot
  // rather than let it read as resistance.
  const rubberExtra = useSharedValue(0);
  const [dragging, setDragging] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // Stable references (FlatList warns/ignores a changing identity) — see the
  // same pattern in app/(tabs)/news/index.tsx.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const top = viewableItems.find((v) => v.isViewable);
    if (top && typeof top.index === 'number') setActiveIndex(top.index);
  }).current;

  const pan = Gesture.Pan()
    .onStart(() => {
      dragStartProgress.value = progress.value;
      runOnJS(setDragging)(true);
    })
    .onUpdate((e) => {
      const raw = dragStartProgress.value - e.translationY / dragRange;
      const clamped = Math.min(1, Math.max(0, raw));
      progress.value = clamped;
      const overshoot = raw - clamped;
      rubberExtra.value = overshoot === 0 ? 0 : rubberband(overshoot, 1) * dragRange;
    })
    .onEnd((e) => {
      const velocityInProgressUnits = -e.velocityY / dragRange;
      const projected = progress.value + projectMomentum(velocityInProgressUnits);
      const target = nearestSnapPoint(projected, [0, 1]);
      progress.value = withSpring(target, { ...springs.gentle, velocity: velocityInProgressUnits });
      rubberExtra.value = withSpring(0, springs.gentle);
      runOnJS(setDragging)(false);
    });

  const sheetStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [COLLAPSED_HEIGHT, expandedHeight], Extrapolation.CLAMP) + rubberExtra.value,
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
              scrollEnabled={!dragging}
              showsHorizontalScrollIndicator={false}
              viewabilityConfig={viewabilityConfig}
              onViewableItemsChanged={onViewableItemsChanged}
              renderItem={({ item, index }) => (
                <View style={[styles.candidateCard, { width }]}>
                  <View style={styles.candidateHeadRow}>
                    <Image source={{ uri: photoUri }} style={[styles.photo, { backgroundColor: colors.surface2 }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.candidateName, { color: colors.text }]} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <PillBadge label={`${Math.round(item.confidence * 100)}% confidence`} />
                    </View>
                  </View>
                  <Text style={[styles.candidateReason, { color: colors.text2 }]}>{item.reason}</Text>
                  {item.symbol ? (
                    <CandidateOverview symbol={item.symbol} active={index === activeIndex} />
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
  candidateCard: { flex: 1, paddingHorizontal: spacing.xl, gap: spacing.md },
  candidateHeadRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  photo: { width: 56, height: 56, borderRadius: radius.sm },
  candidateName: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  candidateReason: { fontSize: 12.5, lineHeight: 17 },
  notTracked: { fontSize: 12.5, marginTop: spacing.sm },
  overviewBlock: { gap: spacing.md },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  price: { fontSize: 20, fontWeight: '700' },
  change: { fontSize: 13.5, fontWeight: '700' },
  newsHeading: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  newsLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  newsRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm, gap: 2 },
  newsTitle: { fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
  newsSummary: { fontSize: 11.5, lineHeight: 15 },
  swipeHint: { textAlign: 'center', fontSize: 11.5, paddingBottom: spacing.md },
  closeBtn: { position: 'absolute', top: spacing.sm, right: spacing.md, padding: spacing.xs },
});
