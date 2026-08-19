// A fridge, drawn rather than shipped.
//
// The obvious move is a PNG, and it costs a few hundred kilobytes, a second
// asset for dark mode, and something to re-export every time the palette
// moves. This is plain Views: it takes its colours from the theme, scales to
// any screen, and — the part a picture cannot do — the door opens while the
// scan is running, so the wait has something to look at.
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { COLORS } from '../lib/theme';

// Each shelf is a row of items; a number is a width, the colour speaks for
// itself. Roughly what a fridge looks like from the front, without pretending
// to be a photograph.
const SHELVES: { w: number; h: number; color: string; radius?: number }[][] = [
  [
    { w: 16, h: 26, color: '#F3F0E8', radius: 4 },
    { w: 14, h: 22, color: '#EDE7DA', radius: 4 },
    { w: 18, h: 30, color: '#F2A03D', radius: 5 },
  ],
  [
    { w: 15, h: 32, color: '#FFFFFF', radius: 5 },
    { w: 13, h: 28, color: '#8CBF6A', radius: 5 },
    { w: 13, h: 28, color: '#F2C53D', radius: 5 },
  ],
  [
    { w: 20, h: 20, color: '#7FB069', radius: 8 },
    { w: 16, h: 18, color: '#E4572E', radius: 8 },
    { w: 16, h: 18, color: '#F2A03D', radius: 8 },
  ],
  [
    { w: 22, h: 18, color: '#5F9E4A', radius: 8 },
    { w: 18, h: 16, color: '#EDE7DA', radius: 8 },
  ],
];

export default function FridgeArt({ scanning = false }: { scanning?: boolean }) {
  // 0 = closed, 1 = open. The door swings on its right edge, so the hinge is
  // the transform origin — which RN has no property for, hence the
  // translate-rotate-translate sandwich.
  const open = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(open, {
      toValue: scanning ? 1 : 0,
      duration: 520,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();

    if (!scanning) { glow.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scanning]);

  return (
    <View style={styles.stage}>
      <View style={styles.body}>
        {SHELVES.map((row, i) => (
          <View key={i} style={styles.shelf}>
            <View style={styles.items}>
              {row.map((item, j) => (
                <View
                  key={j}
                  style={{
                    width: item.w,
                    height: item.h,
                    backgroundColor: item.color,
                    borderRadius: item.radius ?? 3,
                  }}
                />
              ))}
            </View>
            <View style={styles.shelfLine} />
          </View>
        ))}

        {/* The light that comes on when the door opens. */}
        <Animated.View style={[styles.light, { opacity: glow }]} pointerEvents="none" />
      </View>

      <Animated.View
        style={[
          styles.door,
          {
            transform: [
              { translateX: 62 },
              { rotateY: open.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-72deg'] }) },
              { translateX: -62 },
            ],
          },
        ]}
      >
        <View style={styles.handle} />
      </Animated.View>
    </View>
  );
}

const W = 128;
const H = 168;

const styles = StyleSheet.create({
  stage: { width: W, height: H, alignSelf: 'center' },
  body: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FBFAF7',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#E2DACB',
    padding: 8,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  shelf: { flex: 1, justifyContent: 'flex-end' },
  items: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, paddingHorizontal: 4 },
  shelfLine: { height: 2, backgroundColor: '#E7E0D2', borderRadius: 1, marginTop: 3 },
  light: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.orange },

  door: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F1ECE3',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#E2DACB',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 8,
  },
  handle: { width: 5, height: 44, borderRadius: 3, backgroundColor: '#C9C0AE' },
});
