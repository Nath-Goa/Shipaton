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
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { springs, triggerFeedback } from '@/constants/animations';
import { material } from '@/constants/materials';
import { spacing } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/hooks/useTheme';
import { useQolStore } from '@/store/useQolStore';
import { projectedSnapIndex, rubberband } from '@/utils/motion';

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
// Rubber-band "give" past the first/last tab, in progress-units (dimension=1
// since progress is already a fractional tab-index, not pixels).
const RUBBERBAND_CONSTANT = 0.55;

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
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const routes = state.routes;
  const index = state.index;

  const progress = useSharedValue(index);
  const gestureStartProgress = useSharedValue(index);
  // The translation already accumulated by the time the pan activates — see
  // swipeGesture.onStart below.
  const gestureAnchorX = useSharedValue(0);
  const quickMenuProgress = useSharedValue(0);
  const previousIndexRef = useRef(index);
  const longPressHandledRef = useRef<number | null>(null);
  const lastTabTapRef = useRef<{ index: number; at: number } | null>(null);
  // Set right before a gesture-driven navigation.dispatch, consumed once by
  // the index-driven effect below so it doesn't re-animate `progress` with a
  // fresh withTiming over the gesture's own spring, which already carried it
  // to `index` with the release velocity — a competing timing animation
  // there would hard-cut that velocity, exactly the "brick wall" the
  // apple-design skill warns against (§3).
  const gestureCommitTargetRef = useRef<number | null>(null);
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

    if (gestureCommitTargetRef.current === index) {
      // The swipe gesture already put `progress` here itself (see
      // swipeGesture.onEnd below) — this index change is just React
      // Navigation catching up, not a tap that needs its own animation.
      gestureCommitTargetRef.current = null;
      return;
    }

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

  // Called from the swipe gesture's onEnd (via runOnJS — navigation.dispatch
  // and these refs are JS-thread only, unsafe to read from a UI-thread
  // worklet, which is why the worklet always calls this unconditionally with
  // its target and the "already here?" check happens in here instead).
  function navigateByGesture(target: number) {
    if (target === indexRef.current) return;
    const route = routesRef.current[target];
    if (!route) return;
    gestureCommitTargetRef.current = target;
    triggerFeedback('navigation');
    navigation.dispatch({
      ...CommonActions.navigate(route.name, route.params),
      target: stateKeyRef.current,
    });
  }

  // A continuous drag physically can't travel further than the immediate
  // neighbour tabs (tab width == screen width), so only those two ever need
  // to be revealed mid-gesture — eagerly mounting them on touch-down closes
  // the gap where a drag starting within the first WARMUP_DELAY_MS could
  // otherwise reveal a still-unmounted tab as blank space. Takes no argument
  // (reads indexRef.current itself) since it's invoked via runOnJS from a
  // worklet, where reading a plain ref isn't safe — see navigateByGesture.
  function prewarmNeighbors() {
    const i = indexRef.current;
    setRenderedKeys((prev) => {
      const all = routesRef.current;
      let next: Set<string> | null = null;
      for (const ni of [i - 1, i + 1]) {
        const key = all[ni]?.key;
        if (key && !prev.has(key)) {
          if (!next) next = new Set(prev);
          next.add(key);
        }
      }
      return next ?? prev;
    });
  }

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

  // routes.length is effectively fixed for the app's lifetime and `routes`
  // is a fresh value every render anyway (swipeGesture below isn't
  // memoized), so capturing it directly here — rather than via routesRef —
  // is safe to close over inside the worklets below: refs are JS-thread-only
  // and unsafe to dereference from a UI-thread worklet, but a plain primitive
  // captured at gesture-creation time is exactly how rowStyle/pillStyle above
  // already close over `width`/`tabWidth`/`pillWidth`.
  const maxIndex = routes.length - 1;

  // 1:1 finger-tracked, rubber-banded at the first/last tab, momentum-
  // projected on release with real velocity handoff into the settle spring
  // — see .claude/skills/apple-design §§1-2, 6, 9. Deliberately NOT
  // `.runOnJS(true)` on the whole gesture (unlike before): onUpdate needs to
  // run as a UI-thread worklet every frame for smooth 1:1 tracking, so only
  // the JS-only bits (navigation.dispatch, the setRenderedKeys call inside
  // prewarmNeighbors) explicitly hop over via runOnJS — and those two
  // functions read indexRef/routesRef themselves rather than the worklets
  // passing ref values in as arguments, since a ref read has to happen on
  // the JS thread to be safe.
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-SWIPE_ACTIVE_OFFSET, SWIPE_ACTIVE_OFFSET])
    .failOffsetY([-SWIPE_FAIL_OFFSET_Y, SWIPE_FAIL_OFFSET_Y])
    .enabled(quickMenuIndex === null)
    .onBegin(() => {
      // Read the live/presentation value, not `index` — correctly handles
      // grabbing the row again while a previous slide is still animating.
      gestureStartProgress.value = progress.value;
      runOnJS(prewarmNeighbors)();
    })
    .onStart((e) => {
      // The pan doesn't activate until the finger has already travelled
      // SWIPE_ACTIVE_OFFSET px, so translationX is ~±32 by the time tracking
      // begins. Subtracting that activation offset below is what keeps the
      // row glued to the finger from its current position; without it the
      // row jumps a tab-fraction the instant the swipe takes hold, which
      // reads as the content slipping out from under the touch
      // (apple-design §2 — respect the offset from where they grabbed it).
      gestureAnchorX.value = e.translationX;
    })
    .onUpdate((e) => {
      const raw = gestureStartProgress.value - (e.translationX - gestureAnchorX.value) / width;
      progress.value =
        raw < 0
          ? -rubberband(-raw, 1, RUBBERBAND_CONSTANT)
          : raw > maxIndex
            ? maxIndex + rubberband(raw - maxIndex, 1, RUBBERBAND_CONSTANT)
            : raw;
    })
    .onEnd((e) => {
      const velocityInProgressUnits = -e.velocityX / width;
      // One swipe moves at most one tab. Momentum projection decides
      // *whether* the flick carries far enough to commit (so a short fast
      // flick still counts, which position alone would miss), but not how
      // far: a tab is a full screen wide, and at 0.998 deceleration an
      // ordinary 1500px/s flick projects roughly two tabs and a hard one
      // three or four. Letting that stand would make a single swipe skip
      // past tabs the user never asked for — and past ones prewarmNeighbors
      // hasn't mounted — where every platform pager, and this navigator
      // before the gesture rework, moves exactly one. Same reasoning as the
      // swipeable list rows: project the intent, then snap to the adjacent
      // stop, not to wherever the projection lands.
      const startIndex = Math.round(gestureStartProgress.value);
      const projected = reducedMotion
        ? Math.round(Math.min(maxIndex, Math.max(0, progress.value)))
        : projectedSnapIndex(progress.value, velocityInProgressUnits, maxIndex);
      const target = Math.max(startIndex - 1, Math.min(startIndex + 1, projected));

      progress.value = reducedMotion
        ? withTiming(target, { duration: 90, easing: SLIDE_EASING })
        : withSpring(target, { ...springs.reposition, velocity: velocityInProgressUnits });

      // navigateByGesture itself checks target against the live index and
      // no-ops if they already match — see its own comment for why that
      // check can't safely live here in the worklet.
      runOnJS(navigateByGesture)(target);
    });

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
            intensity={material.chrome.intensity}
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
            <BlurView intensity={material.overlay.intensity} tint={scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
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
