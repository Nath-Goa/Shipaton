import { BlurView } from 'expo-blur';
import { withLayoutContext } from 'expo-router';
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
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { triggerFeedback } from '@/constants/animations';
import { useTheme } from '@/hooks/useTheme';

// A tab navigator that slides horizontally between tabs instead of cutting
// between them. Every tab lives in one row that is `tabCount` screens wide,
// so moving from the first tab to the last physically travels past the ones
// in between and you actually see them go by — which a stock bottom-tabs
// navigator can't do, since it only ever renders the focused screen.
//
// Built on React Navigation's custom-navigator API (useNavigationBuilder +
// TabRouter) and surfaced to expo-router through withLayoutContext, so
// routing, nested per-tab stacks, and typed routes all keep working exactly
// as before — only the presentation changes.

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

const TAB_BAR_HEIGHT = 56;
const PILL_DIAMETER = 42;
const PILL_TOP_INSET = 5;
const ICON_SIZE = 24;

// Tab roots stay mounted once rendered (this matches the previous <Tabs>
// behaviour), but mounting all six at launch would put every screen's work
// on the startup path. Instead the focused tab renders immediately, and the
// rest are warmed shortly after first paint so later slides have real
// content to travel past. A jump that happens before warm-up finishes still
// works: the slide itself runs on the UI thread, so it stays smooth even
// while the newly mounted screens are still rendering.
const WARMUP_DELAY_MS = 700;

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
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const routes = state.routes;
  const index = state.index;

  const progress = useSharedValue(index);
  const previousIndexRef = useRef(index);
  // `routes` gets a new identity on every navigation, so effects below read
  // it through a ref rather than depending on it — otherwise each tab switch
  // would restart the warm-up timer and it might never fire.
  const routesRef = useRef(routes);
  routesRef.current = routes;

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
      duration: Math.min(BASE_DURATION_MS + PER_EXTRA_TAB_MS * (distance - 1), MAX_DURATION_MS),
      easing: SLIDE_EASING,
    });
  }, [index, progress]);

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
  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * tabWidth + (tabWidth - PILL_DIAMETER) / 2 }],
  }));

  return (
    <NavigationContent>
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Animated.View style={[styles.row, { width: width * routes.length }, rowStyle]}>
          {routes.map((route, i) => (
            <TabPage key={route.key} index={i} progress={progress} width={width}>
              {renderedKeys.has(route.key) ? descriptors[route.key].render() : null}
            </TabPage>
          ))}
        </Animated.View>

        <View style={[styles.tabBar, { height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]}>
          <BlurView
            intensity={70}
            tint={scheme === 'dark' ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[styles.pill, { backgroundColor: colors.accentSoft }, pillStyle]}
          />
          {routes.map((route, i) => {
            const options = descriptors[route.key].options as SlidingTabOptions;
            const focused = i === index;
            const color = focused ? colors.accent : colors.text3;

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={options.title ?? route.name}
                style={styles.tabButton}
                onPress={() => {
                  triggerFeedback('navigation');
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
      </View>
    </NavigationContent>
  );
}

const styles = StyleSheet.create({
  // Clipped so the tabs parked off to either side never paint outside.
  root: { flex: 1, overflow: 'hidden' },
  row: { flex: 1, flexDirection: 'row' },
  tabBar: { flexDirection: 'row', alignItems: 'flex-start' },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 7, gap: 2 },
  tabLabel: { fontSize: 10.5, fontWeight: '600' },
  pill: {
    position: 'absolute',
    top: PILL_TOP_INSET,
    left: 0,
    width: PILL_DIAMETER,
    height: PILL_DIAMETER,
    borderRadius: PILL_DIAMETER / 2,
  },
});

const createSlidingTabNavigator = createNavigatorFactory(SlidingTabNavigator);

export const SlidingTabs = withLayoutContext<
  SlidingTabOptions,
  typeof SlidingTabNavigator,
  TabNavigationState<ParamListBase>,
  SlidingTabEventMap
>(createSlidingTabNavigator().Navigator);
