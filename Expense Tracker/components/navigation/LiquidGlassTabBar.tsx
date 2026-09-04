import { BlurView } from 'expo-blur';
import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { springs } from '@/constants/animations';
import { radius } from '@/constants/theme';
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
const PILL_MARGIN = 6;

function activeIndexFor(pathname: string): number {
  if (pathname === '/') return 0;
  for (let i = 1; i < TAB_ROUTE_ORDER.length; i++) {
    if (pathname.startsWith(`/${TAB_ROUTE_ORDER[i]}`)) return i;
  }
  return 0;
}

export function LiquidGlassTabBar() {
  const { colors, scheme } = useTheme();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const tabWidth = width / TAB_COUNT;

  const translateX = useSharedValue(activeIndexFor(pathname) * tabWidth);

  useEffect(() => {
    translateX.value = withSpring(activeIndexFor(pathname) * tabWidth, springs.gentle);
  }, [pathname, tabWidth, translateX]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: tabWidth,
  }));

  return (
    <>
      <BlurView
        intensity={70}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        style={[StyleSheet.absoluteFill, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}
      />
      <Animated.View pointerEvents="none" style={[styles.pillWrap, pillStyle]}>
        <Animated.View style={[styles.pill, { backgroundColor: colors.accentSoft }]} />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  pillWrap: { position: 'absolute', top: 4, bottom: 4, left: 0, padding: PILL_MARGIN },
  pill: { flex: 1, borderRadius: radius.md },
});
