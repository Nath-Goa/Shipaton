import { BlurView } from 'expo-blur';
import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { springs } from '@/constants/animations';
import { useTheme } from '@/hooks/useTheme';

// iOS-style "liquid glass" tab bar background: a real blur (content behind
// the bar shows through, softly frosted) plus one shared pill that slides
// between tabs, rather than each tab button fading its own highlight in and
// out independently. Kept in normal document flow (not position:'absolute'
// floating over content) — a true floating glass bar needs every screen to
// reserve bottom padding for the bar's height, which is a much wider,
// riskier change than this visual pass calls for.
const TAB_ROUTE_ORDER = ['index', 'learn', 'markets', 'portfolio', 'expenses', 'assistant'];
const TAB_COUNT = TAB_ROUTE_ORDER.length;
// A round highlight sized to the icon, not a pill stretched to the bar's
// full height — the bar is much taller than the icon (it also has to fit
// the label underneath), so spanning top-to-bottom read as a tall oval
// hanging below the button instead of something wrapped around it.
const PILL_DIAMETER = 42;
const PILL_TOP_INSET = 5;

function activeIndexFor(pathname: string): number {
  if (pathname === '/' || pathname === '' || pathname === '/index') return 0;
  for (let i = 1; i < TAB_ROUTE_ORDER.length; i++) {
    if (pathname === `/${TAB_ROUTE_ORDER[i]}` || pathname.startsWith(`/${TAB_ROUTE_ORDER[i]}/`) || pathname.startsWith(`/${TAB_ROUTE_ORDER[i]}?`)) return i;
  }
  return 0;
}

export function LiquidGlassTabBar() {
  const { colors, scheme } = useTheme();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const tabWidth = width / TAB_COUNT;
  const centerOffset = (tabWidth - PILL_DIAMETER) / 2;

  const translateX = useSharedValue(activeIndexFor(pathname) * tabWidth + centerOffset);

  useEffect(() => {
    translateX.value = withSpring(activeIndexFor(pathname) * tabWidth + centerOffset, springs.snappy);
  }, [pathname, tabWidth, centerOffset, translateX]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <>
      <BlurView
        intensity={70}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        style={[StyleSheet.absoluteFill, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.pill, { backgroundColor: colors.accentSoft }, pillStyle]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: PILL_TOP_INSET,
    left: 0,
    width: PILL_DIAMETER,
    height: PILL_DIAMETER,
    borderRadius: PILL_DIAMETER / 2,
  },
});
