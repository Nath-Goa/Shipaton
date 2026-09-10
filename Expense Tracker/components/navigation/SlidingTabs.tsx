import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router, withLayoutContext, type Href } from 'expo-router';
import {
  CommonActions,
  createNavigatorFactory,
  TabRouter,
  useNavigationBuilder,
  type ParamListBase,
  type TabActionHelpers,
  type TabNavigationState,
  type TabRouterOptions,
} from 'expo-router/react-navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { triggerFeedback } from '@/constants/animations';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useQolStore } from '@/store/useQolStore';

// A tab navigator that slides horizontally between tabs instead of cutting
// between them. Every tab lives in one row that is `tabCount` screens wide,
// so moving from the first tab to the last physically travels past the ones
// in between and you actually see them go by — which a stock bottom-tabs
// navigator can't do, since it only ever renders the focused screen.
//
// Built on React Navigation's custom-navigator API (useNavigationBuilder +
// TabRouter) and surfaced to expo-router through withLayoutContext, so
// routing and the nested per-tab stacks keep working exactly as before —
// only the presentation changes. Tapping the already-focused tab still pops
// that tab's stack to its root: this emits `tabPress` on every press, and
// expo-router's stack navigator is what listens for it and pops.

export type SlidingTabOptions = {
  title?: string;
  tabBarIcon?: (props: { focused: boolean; color: string; size: number }) => ReactNode;
};

type SlidingTabEventMap = {
  tabPress: { data: undefined; canPreventDefault: true };
};

// Distance-aware timing: a neighbouring tab should feel instant, while a
// jump across the whole bar needs a little longer or the intermediate tabs
// are a smear rather than something you can see. Worst case here is five
// tabs at 520ms, comfortably inside the 1.5s ceiling.
const BASE_DURATION_MS = 300;
const PER_EXTRA_TAB_MS = 55;
const MAX_DURATION_MS = 560;
// Material 3's "emphasized decelerate" curve — leaves quickly, lands softly.
const SLIDE_EASING = Easing.bezier(0.2, 0, 0, 1);

// Off-centre tabs sit slightly back and dimmed, so a long slide reads as
// travelling past real screens rather than one flat strip being dragged.
const OFFSCREEN_SCALE = 0.97;
const OFFSCREEN_OPACITY = 0.55;

const TAB_BAR_HEIGHT = 62;
// A rounded rect spanning the tab button's own full content box (icon +
// label), not a fixed circle sitting only behind the icon — that left the
// label uncovered below it.
const PILL_VERTICAL_INSET = 6;
const PILL_HORIZONTAL_MARGIN = 6;
const PILL_RADIUS = 20;
const ICON_SIZE = 24;

// Tab roots stay mounted once rendered (this matches the previous <Tabs>
// behaviour), but mounting all six at launch would put every screen's work
// on the startup path. Instead the focused tab renders immediately, and the
// rest are warmed shortly after first paint so later slides have real
// content to travel past. A jump that happens before warm-up finishes still
// works: the slide itself runs on the UI thread, so it stays smooth even
// while the newly mounted screens are still rendering.
const WARMUP_DELAY_MS = 700;

const SWIPE_ACTIVE_OFFSET = 32;
const SWIPE_FAIL_OFFSET_Y = 18;
const SWIPE_INTENT_THRESHOLD = 75;
const SWIPE_VELOCITY_WEIGHT = 0.12;

type QuickAction = { label: string; icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; href: Href };

const TAB_QUICK_ACTIONS: Record<string, QuickAction[]> = {
  index: [
    { label: 'Open portfolio', icon: 'pie-chart-outline', href: '/markets/portfolio' },
    { label: 'Log an expense', icon: 'receipt-outline', href: '/expenses/add' },
    { label: 'Investor toolkit', icon: 'calculator-outline', href: '/toolkit' },
  ],
  learn: [
    { label: 'Resume learning', icon: 'play-outline', href: '/learn' },
    { label: 'Study flashcards', icon: 'albums-outline', href: '/learn/flashcards' },
    { label: 'Start focus session', icon: 'timer-outline', href: '/learn/focus-session' },
  ],
  markets: [
    { label: 'Browse markets', icon: 'stats-chart-outline', href: '/markets' },
    { label: 'Open portfolio', icon: 'pie-chart-outline', href: '/markets/portfolio' },
    { label: 'Practice a trade', icon: 'flask-outline', href: '/markets/practice' },
  ],
  news: [
    { label: 'Latest market news', icon: 'newspaper-outline', href: '/news' },
    { label: 'Explore markets', icon: 'stats-chart-outline', href: '/markets' },
    { label: 'Ask the analyst', icon: 'sparkles-outline', href: '/assistant' },
  ],
  expenses: [
    { label: 'Quick-add expense', icon: 'add-circle-outline', href: '/expenses/add' },
    { label: 'Review budgets', icon: 'speedometer-outline', href: '/expenses/budgets' },
    { label: 'Savings goals', icon: 'flag-outline', href: '/expenses/goals' },
  ],
  assistant: [
    { label: 'New general question', icon: 'chatbubble-outline', href: '/assistant' },
    { label: 'Ask about AAPL', icon: 'logo-apple', href: '/assistant?symbol=AAPL' },
    { label: 'Assistant settings', icon: 'settings-outline', href: '/settings' },
  ],
};

function QuickMenuItem({
  action,
  itemIndex,
  progress,
  originLeft,
  originWidth,
  targetLeft,
  targetWidth,
  onChoose,
}: {
  action: QuickAction;
  itemIndex: number;
  progress: SharedValue<number>;
  originLeft: number;
  originWidth: number;
  targetLeft: number;
  targetWidth: number;
  onChoose: (href: Href) => void;
}) {
  const { colors } = useTheme();
  const animatedStyle = useAnimatedStyle(() => {
    const expansion = interpolate(progress.value, [0, 0.35, 1], [0, 0, 1], Extrapolation.CLAMP);
    const reveal = itemIndex === 0 ? 1 : interpolate(progress.value, [0.35, 0.58 + itemIndex * 0.08, 1], [0, 0, 1], Extrapolation.CLAMP);
    return {
      opacity: reveal,
      width: interpolate(expansion, [0, 1], [originWidth, targetWidth]),
      transform: [
        { translateX: interpolate(expansion, [0, 1], [originLeft, targetLeft]) },
        { translateY: interpolate(reveal, [0, 1], [0, -itemIndex * 58]) },
        { scale: interpolate(reveal, [0, 1], [0.94, 1]) },
      ],
    };
  });

  return (
    <Animated.View style={[styles.quickItemWrap, animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onChoose(action.href)}
        style={[styles.quickItem, { backgroundColor: colors.surface, borderColor: itemIndex === 0 ? colors.accent : colors.border }]}>
        <View style={[styles.quickIcon, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name={action.icon} size={19} color={colors.accent} />
        </View>
        <Text style={[styles.quickLabel, { color: colors.text }]} numberOfLines={1}>{action.label}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.text3} />
      </Pressable>
    </Animated.View>
  );
}

function TabPage({
  index,
  progress,
  width,
  children,
}: {
  index: number;
  progress: SharedValue<number>;
  width: number;
  children: ReactNode;
}) {
  const pageStyle = useAnimatedStyle(() => {
    const distance = Math.abs(progress.value - index);
    return {
      opacity: interpolate(distance, [0, 1], [1, OFFSCREEN_OPACITY], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(distance, [0, 1], [1, OFFSCREEN_SCALE], Extrapolation.CLAMP) }],
    };
  });

  return <Animated.View style={[{ width }, pageStyle]}>{children}</Animated.View>;
}

function SlidingTabNavigator({
  id,
  initialRouteName,
  backBehavior,
  children,
  layout,
  screenListeners,
  screenOptions,
  screenLayout,
  UNSTABLE_router,
}: any) {
  const { state, descriptors, navigation, NavigationContent } = useNavigationBuilder<
    TabNavigationState<ParamListBase>,
    TabRouterOptions,
    TabActionHelpers<ParamListBase>,
    SlidingTabOptions,
    SlidingTabEventMap
  >(TabRouter, {
    id,
    initialRouteName,
    backBehavior,
    children,
    layout,
    screenListeners,
    screenOptions,
    screenLayout,
    UNSTABLE_router,
  });

  const { colors, scheme } = useTheme();
  const reducedMotion = useQolStore((state) => state.reducedMotion);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const routes = state.routes;
  const index = state.index;

  const progress = useSharedValue(index);
  const quickMenuProgress = useSharedValue(0);
  const previousIndexRef = useRef(index);
  const longPressHandledRef = useRef<number | null>(null);
  const lastTabTapRef = useRef<{ index: number; at: number } | null>(null);
  const [quickMenuIndex, setQuickMenuIndex] = useState<number | null>(null);
  // `routes` gets a new identity on every navigation, so effects below read
  // it through a ref rather than depending on it — otherwise each tab switch
  // would restart the warm-up timer and it might never fire.
  const routesRef = useRef(routes);
  routesRef.current = routes;
  const indexRef = useRef(index);
  indexRef.current = index;
  const stateKeyRef = useRef(state.key);
  stateKeyRef.current = state.key;

  // Which tabs have ever needed to exist. Grows to cover everything a slide
  // passes over, so intermediate tabs are real screens rather than gaps.
  const [renderedKeys, setRenderedKeys] = useState<Set<string>>(() => {
    const key = routes[index]?.key;
    return new Set(key ? [key] : []);
  });

  useEffect(() => {
    const from = previousIndexRef.current;
    previousIndexRef.current = index;
    const distance = Math.abs(index - from);
    if (distance === 0) return;

    const lo = Math.min(from, index);
    const hi = Math.max(from, index);
    setRenderedKeys((prev) => {
      const next = new Set(prev);
      let added = false;
      for (let i = lo; i <= hi; i++) {
        const key = routesRef.current[i]?.key;
        if (key && !next.has(key)) {
          next.add(key);
          added = true;
        }
      }
      return added ? next : prev;
    });

    progress.value = withTiming(index, {
      duration: reducedMotion ? 90 : Math.min(BASE_DURATION_MS + PER_EXTRA_TAB_MS * (distance - 1), MAX_DURATION_MS),
      easing: SLIDE_EASING,
    });
  }, [index, progress, reducedMotion]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setRenderedKeys((prev) => {
        const all = routesRef.current;
        if (prev.size === all.length) return prev;
        const next = new Set(prev);
        for (const route of all) next.add(route.key);
        return next;
      });
    }, WARMUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -progress.value * width }],
  }));

  const tabWidth = width / routes.length;
  const pillWidth = tabWidth - PILL_HORIZONTAL_MARGIN * 2;
  const pillStyle = useAnimatedStyle(() => ({
    width: pillWidth,
    transform: [{ translateX: progress.value * tabWidth + PILL_HORIZONTAL_MARGIN }],
  }));

  const navigateToAdjacentTab = (direction: -1 | 1) => {
    const nextIndex = indexRef.current + direction;
    const route = routesRef.current[nextIndex];
    if (!route) return;

    triggerFeedback('navigation');
    navigation.dispatch({
      ...CommonActions.navigate(route.name, route.params),
      target: stateKeyRef.current,
    });
  };

  function openQuickMenu(tabIndex: number) {
    longPressHandledRef.current = tabIndex;
    setQuickMenuIndex(tabIndex);
    quickMenuProgress.value = 0;
    if (reducedMotion) {
      quickMenuProgress.value = 1;
      triggerFeedback('selection');
      return;
    }
    quickMenuProgress.value = withSequence(
      withTiming(0.35, { duration: 80, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 135, easing: SLIDE_EASING })
    );
    triggerFeedback('selection');
  }

  function closeQuickMenu() {
    quickMenuProgress.value = withTiming(0, { duration: 90 });
    setQuickMenuIndex(null);
  }

  function chooseQuickAction(href: Href) {
    triggerFeedback('navigation');
    setQuickMenuIndex(null);
    router.push(href);
  }

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-SWIPE_ACTIVE_OFFSET, SWIPE_ACTIVE_OFFSET])
    .failOffsetY([-SWIPE_FAIL_OFFSET_Y, SWIPE_FAIL_OFFSET_Y])
    .onEnd(({ translationX, velocityX }) => {
      const intent = translationX + velocityX * SWIPE_VELOCITY_WEIGHT;
      if (Math.abs(intent) < SWIPE_INTENT_THRESHOLD) return;
      navigateToAdjacentTab(intent < 0 ? 1 : -1);
    })
    .runOnJS(true);

  return (
    <NavigationContent>
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <GestureDetector gesture={swipeGesture}>
          <Animated.View style={[styles.row, { width: width * routes.length }, rowStyle]}>
            {routes.map((route, i) => (
              <TabPage key={route.key} index={i} progress={progress} width={width}>
                {renderedKeys.has(route.key) ? descriptors[route.key].render() : null}
              </TabPage>
            ))}
          </Animated.View>
        </GestureDetector>

        <View style={[styles.tabBar, { height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]}>
          <BlurView
            intensity={70}
            tint={scheme === 'dark' ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pill,
              // The tab bar's own height includes the bottom safe-area
              // strip (paddingBottom below), which position:absolute
              // children don't automatically exclude — without adding it
              // back here the pill would stretch down into that strip
              // instead of stopping at the tab content's actual bottom edge.
              { backgroundColor: colors.accentSoft, bottom: PILL_VERTICAL_INSET + insets.bottom },
              pillStyle,
            ]}
          />
          {routes.map((route, i) => {
            const options = descriptors[route.key].options as SlidingTabOptions;
            const focused = i === index;
            const color = focused ? colors.accent : colors.text3;

            return (
              <Pressable
                key={route.key}
                // Matches what the stock bottom-tab item announces, so
                // replacing the navigator didn't quietly downgrade TalkBack:
                // "tab" as the role (iOS ignores it, hence the button there)
                // and an explicit selected state on every tab, not just the
                // active one.
                role={Platform.select({ ios: 'button', default: 'tab' })}
                aria-selected={focused}
                accessibilityLabel={options.title ?? route.name}
                style={styles.tabButton}
                delayLongPress={280}
                onLongPress={() => openQuickMenu(i)}
                onPress={() => {
                  if (longPressHandledRef.current === i) {
                    longPressHandledRef.current = null;
                    return;
                  }
                  triggerFeedback('navigation');
                  const now = Date.now();
                  const doubleTap = focused && lastTabTapRef.current?.index === i && now - lastTabTapRef.current.at < 330;
                  lastTabTapRef.current = { index: i, at: now };
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) {
                    navigation.dispatch({
                      ...CommonActions.navigate(route.name, route.params),
                      target: state.key,
                    });
                  } else if (doubleTap && !event.defaultPrevented) {
                    // A second press re-navigates to the tab root. Nested
                    // stacks handle this like a scroll-to-top/pop-to-root
                    // shortcut, matching native tab-bar conventions.
                    navigation.dispatch({
                      ...CommonActions.navigate(route.name),
                      target: state.key,
                    });
                    useQolStore.getState().reselectTab(route.name === 'index' ? 'home' : route.name);
                  }
                }}>
                {options.tabBarIcon?.({ focused, color, size: ICON_SIZE })}
                <Text style={[styles.tabLabel, { color }]} numberOfLines={1}>
                  {options.title ?? route.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {quickMenuIndex !== null ? (
          <View style={styles.quickOverlay}>
            <BlurView intensity={55} tint={scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <Pressable accessibilityLabel="Close tab shortcuts" style={StyleSheet.absoluteFill} onPress={closeQuickMenu} />
            <View pointerEvents="box-none" style={[styles.quickItemsLayer, { bottom: TAB_BAR_HEIGHT + insets.bottom + 8 }]}>
              {(TAB_QUICK_ACTIONS[routes[quickMenuIndex]?.name ?? ''] ?? []).map((action, actionIndex) => {
                const targetWidth = Math.min(width - spacing.lg * 2, 310);
                return (
                  <QuickMenuItem
                    key={action.label}
                    action={action}
                    itemIndex={actionIndex}
                    progress={quickMenuProgress}
                    originLeft={quickMenuIndex * tabWidth + PILL_HORIZONTAL_MARGIN}
                    originWidth={pillWidth}
                    targetLeft={(width - targetWidth) / 2}
                    targetWidth={targetWidth}
                    onChoose={chooseQuickAction}
                  />
                );
              })}
            </View>
          </View>
        ) : null}
      </View>
    </NavigationContent>
  );
}

const styles = StyleSheet.create({
  // Clipped so the tabs parked off to either side never paint outside.
  root: { flex: 1, overflow: 'hidden' },
  row: { flex: 1, flexDirection: 'row' },
  tabBar: { flexDirection: 'row', alignItems: 'flex-start' },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 8, gap: 3 },
  tabLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.1 },
  pill: {
    position: 'absolute',
    top: PILL_VERTICAL_INSET,
    left: 0,
    borderRadius: PILL_RADIUS,
  },
  quickOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 50 },
  quickItemsLayer: { position: 'absolute', left: 0, right: 0, height: 170 },
  quickItemWrap: { position: 'absolute', left: 0, bottom: 0, height: 50 },
  quickItem: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },
  quickIcon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { flex: 1, fontSize: 13.5, fontWeight: '700' },
});

const createSlidingTabNavigator = createNavigatorFactory(SlidingTabNavigator);

export const SlidingTabs = withLayoutContext<
  SlidingTabOptions,
  typeof SlidingTabNavigator,
  TabNavigationState<ParamListBase>,
  SlidingTabEventMap
>(createSlidingTabNavigator().Navigator);
