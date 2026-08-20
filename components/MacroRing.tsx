// A progress ring, drawn from two half-circles.
//
// No SVG: react-native-svg is a native module and adding it would end the
// over-the-air path. A ring is two halves under a mask — the right half turns
// for the first 50%, the left half for the rest — which is enough for a figure
// that is read at a glance.
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONTS } from '../lib/theme';

const SIZE = 132;
const THICK = 12;

export default function MacroRing({
  value, goal, label,
}: { value: number; goal?: number; label: string }) {
  // Without a goal there is nothing to be a fraction of, so the ring stays
  // empty and the number speaks for itself.
  const pct = goal && goal > 0 ? Math.min(value / goal, 1) : 0;
  const deg = pct * 360;

  const half = (rotate: number, show: boolean) => (
    <View style={[styles.clip, { transform: [{ rotate: `${rotate}deg` }] }]}>
      <View style={[styles.halfRing, !show && { opacity: 0 }]} />
    </View>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.track} />
      {/* Right half sweeps 0–180°, then the left half takes over. */}
      <View style={styles.maskRight}>{half(Math.min(deg, 180) - 180, pct > 0)}</View>
      <View style={styles.maskLeft}>{half(Math.max(deg - 180, 0) - 180, pct > 0.5)}</View>
      <View style={styles.middle}>
        <Text style={styles.value}>{Math.round(value).toLocaleString()}</Text>
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  track: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: SIZE / 2, borderWidth: THICK, borderColor: '#EFE7DC',
  },
  maskRight: { position: 'absolute', right: 0, top: 0, width: SIZE / 2, height: SIZE, overflow: 'hidden' },
  maskLeft: { position: 'absolute', left: 0, top: 0, width: SIZE / 2, height: SIZE, overflow: 'hidden' },
  clip: { width: SIZE, height: SIZE, marginLeft: 0 },
  halfRing: {
    width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: THICK,
    borderTopColor: COLORS.orange, borderRightColor: COLORS.orange,
    borderBottomColor: 'transparent', borderLeftColor: 'transparent',
  },
  middle: { alignItems: 'center' },
  value: { fontFamily: FONTS.display, fontSize: 28, color: COLORS.navy },
  label: { fontSize: 11, color: COLORS.warmGray, marginTop: -2, textAlign: 'center' },
});
