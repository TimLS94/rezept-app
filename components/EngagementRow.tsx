// Cooks, likes and saves, as a row of small stats.
//
// This was three words joined by dots — "3 cooks · 5 likes · 2 saves" — which
// reads as a caption rather than a number, and put the least important figure
// in the same weight as the most important one. Cooking something is the
// expensive act: shopping, an evening, a kitchen. A like is a tap.
//
// So the number leads and the icon carries the meaning, and cooks come first.
// Zeroes are dropped rather than shown: a recipe nobody has cooked yet says
// nothing here, which is better than a row of noughts under something somebody
// spent an evening writing.
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { compactCount, type Engagement } from '../lib/engagement';

type Size = 'sm' | 'md';

export default function EngagementRow({
  engagement,
  size = 'md',
  align = 'left',
}: {
  engagement: Engagement;
  size?: Size;
  /** Centred under a profile, left-aligned under a card. */
  align?: 'left' | 'center';
}) {
  // Cooks only.
  //
  // This showed three figures — cooked, liked, saved — and the two extra ones
  // cost more than they gave. A like is a tap and a save is a bookmark; neither
  // says the recipe worked. Cooking it means somebody shopped for it and spent
  // an evening on it, and next to that number the other two only made it
  // smaller. Likes and saves are still counted and still on the profile totals;
  // they are just not what a recipe card is for.
  if (engagement.cooked <= 0) return null;

  const sm = size === 'sm';
  return (
    <View style={[s.row, { justifyContent: align === 'center' ? 'center' : 'flex-start' }]}>
      <Ionicons name="flame" size={sm ? 12 : 14} color="#C2410C" />
      <Text style={[s.count, sm && s.countSm]}>
        {compactCount(engagement.cooked)} {engagement.cooked === 1 ? 'cook' : 'cooks'}
      </Text>
    </View>
  );
}


const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  count: { fontSize: 13, fontWeight: '700', color: '#C2410C' },
  countSm: { fontSize: 11 },
});
