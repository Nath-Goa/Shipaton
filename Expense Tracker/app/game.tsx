import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { FlappyBirdLoader } from '@/components/games/FlappyBirdLoader';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';

export default function GamePreviewScreen() {
  const { colors } = useTheme();

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <Screen>
      <TopBar title="Bird game" subtitle="Tap to fly through the pipes" />
      <View style={styles.content}>
        <FlappyBirdLoader />
        <Text style={[styles.instructions, { color: colors.text3 }]}>Tap the game to start.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl * 2,
  },
  instructions: {
    fontSize: 13,
    letterSpacing: trackingFor(13),
    marginTop: spacing.sm,
  },
});
