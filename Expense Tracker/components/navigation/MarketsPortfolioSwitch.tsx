import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { spacing } from '@/constants/theme';

type Section = 'markets' | 'portfolio';

const OPTIONS: { value: Section; label: string }[] = [
  { value: 'markets', label: 'Markets' },
  { value: 'portfolio', label: 'Portfolio' },
];

// Markets and Portfolio share one bottom-tab slot — folding one bottom-tab
// slot into the other was the fix for too many tabs on the bar, since
// they're two views of the same trading domain rather than separate ones.
// Portfolio lives as a normal pushed route under Markets' stack
// (app/(tabs)/markets/portfolio), so switching is a router.replace rather
// than an instant local-state swap — this control just makes that switch
// read as flipping between two peer sections instead of drilling into a
// sub-screen. replace (not push) both ways so ping-ponging between them
// never grows the stack.
export function MarketsPortfolioSwitch({ active }: { active: Section }) {
  function handleChange(next: Section) {
    if (next === active) return;
    router.replace(next === 'markets' ? '/markets' : '/markets/portfolio');
  }

  return (
    <View style={styles.wrap}>
      <SegmentedControl options={OPTIONS} value={active} onChange={handleChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.xl, marginBottom: spacing.md },
});
