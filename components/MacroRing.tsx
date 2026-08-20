// A progress ring, drawn from two half-circles.
//
// No SVG: react-native-svg is a native module and adding it would end the
// over-the-air path. A ring is two halves under a mask — the right half turns
// for the first 50%, the left half for the rest — which is enough for a figure
// that is read at a glance.
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONTS } from '../lib/theme';

const SIZE = 138;
const THICK = 11;

export default function MacroRing({
  value, goal, label,
}: { value: number; goal?: number; label: string }) {
  // Without a goal there is nothing to be a fraction of, so the ring stays
  // empty and the number speaks for itself.
  const pct = goal && goal > 0 ? Math.min(value / goal, 1) : 0;
  const deg = pct * 360;

  // A ring whose top and right borders are coloured is orange from 12 o'clock
  // round to 6 o'clock — a half, starting at its own rotation. Turned by
  // deg-180 it ends exactly at `deg`, so the right mask shows 0°→deg and the
  // left mask shows 180°→deg. One rotation serves both halves; using a
  // different one per half was what put the arc outside the track.
  const turn = `${deg - 180}deg`;

  return (
    <View style={styles.wrap}>
      <View style={styles.track} />

      <View style={[styles.mask, styles.maskRight]}>
        {/* The inner ring is full size and has to stay centred on the wrap, so
            under the right-hand mask it hangs half a ring to the left. Without
            this offset the mask showed the ring's left half, drawn over on the
            wrong side of the circle. */}
        <View
          style={[styles.halfRing, styles.offsetLeft, { transform: [{ rotate: turn }] }, pct <= 0 && styles.hidden]}
        />
      </View>

      <View style={[styles.mask, styles.maskLeft]}>
        <View
          style={[styles.halfRing, { transform: [{ rotate: turn }] }, pct <= 0.5 && styles.hidden]}
        />
      </View>

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
  mask: { position: 'absolute', top: 0, width: SIZE / 2, height: SIZE, overflow: 'hidden' },
  maskRight: { right: 0 },
  maskLeft: { left: 0 },
  offsetLeft: { marginLeft: -SIZE / 2 },
  halfRing: {
    width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: THICK,
    borderTopColor: COLORS.orange, borderRightColor: COLORS.orange,
    borderBottomColor: 'transparent', borderLeftColor: 'transparent',
  },
  hidden: { opacity: 0 },
  // Kept clear of the track, so a two-line label cannot run underneath it.
  middle: { alignItems: 'center', width: SIZE - THICK * 2 - 18 },
  value: { fontFamily: FONTS.display, fontSize: 30, color: COLORS.navy },
  label: { fontSize: 11, lineHeight: 14, color: COLORS.warmGray, marginTop: 1, textAlign: 'center' },
});
