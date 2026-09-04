import { StyleSheet, View } from 'react-native';

type Props = { pct: number; color: string; track: string };

export function ProgressBar({ pct, color, track }: Props) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View style={[styles.track, { backgroundColor: track }]}>
      <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
