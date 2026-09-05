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
import type { Engagement } from '../lib/engagement';

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
  const items = [
    { key: 'cooked', icon: 'flame' as const, n: engagement.cooked },
    { key: 'favorited', icon: 'heart' as const, n: engagement.favorited },
    { key: 'saved', icon: 'bookmark' as const, n: engagement.saved },
  ].filter(i => i.n > 0);

  if (!items.length) return null;

  const sm = size === 'sm';
  return (
    <View
      style={[
        s.row,
        { gap: sm ? 10 : 14, justifyContent: align === 'center' ? 'center' : 'flex-start' },
      ]}
    >
      {items.map(i => (
        <View key={i.key} style={s.item}>
          <Ionicons name={i.icon} size={sm ? 12 : 14} color="#C2410C" />
          <Text style={[s.count, sm && s.countSm]}>{compact(i.n)}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * 1200 becomes 1.2k.
 *
 * Four digits under a recipe card push the title out of line, and nobody reads
 * the last two anyway — the difference between 1,203 and 1,247 cooks is not a
 * difference anyone acts on.
 */
function compact(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}k`;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  count: { fontSize: 13, fontWeight: '700', color: '#C2410C' },
  countSm: { fontSize: 11 },
});
