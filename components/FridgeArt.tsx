// An open fridge, drawn from Views.
//
// No SVG and no gradients: both are native modules, and adding one would mean
// every future change needs a fresh native build instead of an over-the-air
// update. Everything here is rectangles — so the realism has to come from how
// they are stacked.
//
// Three things do most of the work:
//   · a narrow neck above a wider body reads as a bottle, not a block
//   · one translucent strip down the left of each item reads as glass
//   · a pale band across the middle reads as a label
// Together they turn coloured rectangles into things you recognise.
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { COLORS } from '../lib/theme';

type Vessel = {
  kind: 'bottle' | 'jar' | 'tub' | 'produce';
  w: number;
  h: number;
  color: string;
  cap?: string;
  label?: boolean;
};

function Item({ v }: { v: Vessel }) {
  const neckW = Math.round(v.w * 0.42);
  const capColor = v.cap ?? '#CFC6B4';

  return (
    <View style={{ alignItems: 'center', width: v.w }}>
      {/* Cap, and for a bottle the neck that carries it. */}
      <View style={{ width: v.kind === 'bottle' ? neckW + 2 : v.w - 2, height: 3.5, backgroundColor: capColor, borderRadius: 1.5 }} />
      {v.kind === 'bottle' && (
        <View style={{ width: neckW, height: 5, backgroundColor: v.color }} />
      )}

      <View
        style={{
          width: v.w,
          height: v.h,
          backgroundColor: v.color,
          // Shoulders: rounder at the top than the base on a bottle, evenly
          // round on produce, barely rounded on a tub.
          borderTopLeftRadius: v.kind === 'produce' ? v.w / 2 : v.kind === 'bottle' ? 5 : 3,
          borderTopRightRadius: v.kind === 'produce' ? v.w / 2 : v.kind === 'bottle' ? 5 : 3,
          borderBottomLeftRadius: v.kind === 'produce' ? v.w / 2 : 2.5,
          borderBottomRightRadius: v.kind === 'produce' ? v.w / 2 : 2.5,
          overflow: 'hidden',
          justifyContent: 'center',
        }}
      >
        {/* The label. A pale band is what makes a jar look like a product. */}
        {v.label && (
          <View style={{ height: Math.max(5, v.h * 0.32), backgroundColor: 'rgba(255,255,255,0.82)' }} />
        )}
        {/* Glass highlight, offset left, plus a soft shadow on the right so
            the shape has a side rather than being flat. */}
        <View style={[styles.shine, { left: 2, width: Math.max(1.5, v.w * 0.13) }]} />
        <View style={[styles.shade, { width: Math.max(2, v.w * 0.18) }]} />
      </View>
    </View>
  );
}

const SHELVES: Vessel[][][] = [
  // top shelf: left column, right column
  [
    [
      { kind: 'jar', w: 13, h: 19, color: '#F4F1EA', cap: '#C9C0AE', label: true },
      { kind: 'jar', w: 12, h: 16, color: '#EFEADD', cap: '#C9C0AE', label: true },
    ],
    [
      { kind: 'jar', w: 11, h: 15, color: '#6FA453', cap: '#2F5E2F', label: true },
      { kind: 'jar', w: 11, h: 14, color: '#9CC177', cap: '#2F5E2F', label: true },
      { kind: 'bottle', w: 13, h: 20, color: '#F0A03D', cap: '#2F5E2F', label: true },
    ],
  ],
  [
    [
      { kind: 'bottle', w: 12, h: 24, color: '#FDFDFB', cap: '#3E6FB0', label: true },
      { kind: 'bottle', w: 11, h: 21, color: '#6FA453', cap: '#3F7A3F' },
      { kind: 'bottle', w: 11, h: 21, color: '#EFC03A', cap: '#C79A1E' },
    ],
    [
      { kind: 'jar', w: 17, h: 19, color: '#EFE3C8', cap: '#3F7A3F', label: true },
      { kind: 'jar', w: 10, h: 15, color: '#C6402C', cap: '#2A2A2A' },
      { kind: 'jar', w: 10, h: 15, color: '#C6402C', cap: '#2A2A2A' },
    ],
  ],
  [
    [
      { kind: 'produce', w: 15, h: 15, color: '#7FB069' },
      { kind: 'produce', w: 13, h: 13, color: '#9CC177' },
    ],
    [
      { kind: 'produce', w: 11, h: 12, color: '#E4572E' },
      { kind: 'produce', w: 11, h: 12, color: '#6FA453' },
      { kind: 'produce', w: 11, h: 12, color: '#EFC03A' },
    ],
  ],
  [
    [
      { kind: 'tub', w: 15, h: 12, color: '#5F9E4A' },
      { kind: 'produce', w: 9, h: 11, color: '#E48A2E' },
      { kind: 'produce', w: 9, h: 11, color: '#E48A2E' },
    ],
    [
      { kind: 'tub', w: 16, h: 12, color: '#EFE9DC' },
      { kind: 'tub', w: 15, h: 12, color: '#DDE7CE' },
    ],
  ],
];

export default function FridgeArt({ scanning = false }: { scanning?: boolean }) {
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!scanning) { glow.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.2, duration: 800, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.03, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scanning]);

  return (
    <View style={styles.stage}>
      {/* The open door, hinged left, tilted away. Its inner face carries door
          bins, which is most of what makes a fridge door recognisable. */}
      <View style={styles.door}>
        <View style={styles.doorPanel}>
          {[0, 1, 2].map(i => (
            <View key={i} style={styles.doorBin} />
          ))}
        </View>
        <View style={styles.handle} />
      </View>

      <View style={styles.body}>
        {/* Back wall in a cooler tone than the frame, so the interior has
            depth instead of being one flat field. */}
        <View style={styles.backWall} />
        <View style={styles.topShade} />

        <View style={styles.interior}>
          {SHELVES.map((shelf, i) => (
            <View key={i} style={styles.shelf}>
              <View style={styles.shelfRow}>
                <View style={styles.column}>
                  <View style={styles.items}>
                    {shelf[0].map((v, j) => <Item key={j} v={v} />)}
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.column}>
                  <View style={styles.items}>
                    {shelf[1].map((v, j) => <Item key={j} v={v} />)}
                  </View>
                </View>
              </View>
              {/* Glass shelf: a bright edge over a thin shadow. */}
              <View style={styles.shelfGlass} />
              <View style={styles.shelfShadow} />
            </View>
          ))}
        </View>

        <Animated.View style={[styles.light, { opacity: glow }]} pointerEvents="none" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: 200, height: 186, alignSelf: 'center', flexDirection: 'row' },

  door: {
    width: 34,
    height: 176,
    alignSelf: 'center',
    backgroundColor: '#E9E2D4',
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#DAD1BE',
    marginRight: -5,
    transform: [{ perspective: 700 }, { rotateY: '40deg' }],
  },
  doorPanel: {
    position: 'absolute',
    top: 12, bottom: 12, left: 5, right: 9,
    justifyContent: 'space-around',
  },
  doorBin: {
    height: 16,
    backgroundColor: '#F7F3EA',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#E0D8C7',
  },
  handle: {
    position: 'absolute', right: 3, top: '32%',
    width: 3, height: 40, borderRadius: 2, backgroundColor: '#B9AF9C',
  },

  body: {
    flex: 1,
    height: 186,
    backgroundColor: '#F7F5F0',
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#E2DACB',
    overflow: 'hidden',
  },
  backWall: {
    position: 'absolute',
    top: 6, bottom: 6, left: 6, right: 6,
    backgroundColor: '#FBFAF7',
    borderRadius: 9,
  },
  // The inside of a fridge is darkest at the top, where the light does not
  // reach the ceiling.
  topShade: {
    position: 'absolute',
    top: 0, left: 0, right: 0, height: 14,
    backgroundColor: 'rgba(120,110,95,0.07)',
  },

  interior: { flex: 1, padding: 8 },
  shelf: { flex: 1, justifyContent: 'flex-end' },
  shelfRow: { flexDirection: 'row', alignItems: 'flex-end' },
  column: { flex: 1 },
  items: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3 },
  divider: { width: 1.5, alignSelf: 'stretch', backgroundColor: '#EDE7DA', marginHorizontal: 4 },
  shelfGlass: { height: 1.5, backgroundColor: '#FFFFFF', marginTop: 2, borderRadius: 1 },
  shelfShadow: { height: 1.5, backgroundColor: 'rgba(120,110,95,0.16)', borderRadius: 1 },

  shine: { position: 'absolute', top: 2, bottom: 2, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 1 },
  shade: { position: 'absolute', top: 0, bottom: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.10)' },

  light: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.orange },
});
