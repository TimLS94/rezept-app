// An open fridge, drawn rather than shipped.
//
// It stands open on purpose. The first version had a closed door that only
// swung aside while a scan was running, which meant the thing you were meant
// to look at — the food — was behind a panel every time you arrived. A fridge
// with the door shut is a white box; the point of the picture is what is
// inside it.
//
// Drawn from Views rather than a PNG: no few-hundred-kilobyte asset, no second
// file for dark mode, no re-export when the palette moves, and it scales to
// any screen. Everything takes its colour from the theme.
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { COLORS } from '../lib/theme';

type Item = { w: number; h: number; color: string; radius?: number; cap?: string };

// Two columns of shelves, the way a fridge actually reads from the front:
// jars and bottles up top, produce below. `cap` draws a lid in a darker shade.
const LEFT: Item[][] = [
  [
    { w: 13, h: 20, color: '#F4F1EA', radius: 3, cap: '#D8D2C4' },
    { w: 12, h: 17, color: '#EFEADD', radius: 3, cap: '#D8D2C4' },
  ],
  [
    { w: 12, h: 26, color: '#FFFFFF', radius: 4, cap: '#4A7EBB' },
    { w: 11, h: 23, color: '#7FB069', radius: 4, cap: '#3F7A3F' },
    { w: 11, h: 23, color: '#F2C53D', radius: 4, cap: '#C79A1E' },
  ],
  [
    { w: 16, h: 15, color: '#8CBF6A', radius: 7 },
    { w: 14, h: 13, color: '#A8CC7E', radius: 7 },
  ],
  [
    { w: 15, h: 14, color: '#5F9E4A', radius: 6 },
    { w: 10, h: 12, color: '#E4572E', radius: 5 },
    { w: 10, h: 12, color: '#F2A03D', radius: 5 },
  ],
];

const RIGHT: Item[][] = [
  [
    { w: 11, h: 16, color: '#7FB069', radius: 3, cap: '#2F5E2F' },
    { w: 11, h: 15, color: '#A8CC7E', radius: 3, cap: '#2F5E2F' },
    { w: 13, h: 22, color: '#F2A03D', radius: 4, cap: '#2F5E2F' },
  ],
  [
    { w: 17, h: 21, color: '#EFE3C8', radius: 5, cap: '#3F7A3F' },
    { w: 11, h: 17, color: '#D8452F', radius: 4, cap: '#2A2A2A' },
    { w: 11, h: 17, color: '#D8452F', radius: 4, cap: '#2A2A2A' },
  ],
  [
    { w: 12, h: 14, color: '#F2A03D', radius: 6 },
    { w: 12, h: 14, color: '#7FB069', radius: 6 },
    { w: 12, h: 14, color: '#F2C53D', radius: 6 },
  ],
  [
    { w: 16, h: 13, color: '#EFE9DC', radius: 6 },
    { w: 16, h: 13, color: '#DDE7CE', radius: 6 },
  ],
];

export default function FridgeArt({ scanning = false }: { scanning?: boolean }) {
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!scanning) { glow.setValue(0); return; }
    // The interior light coming up and down while the scan runs, so the wait
    // has something to watch.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.22, duration: 800, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.04, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scanning]);

  const column = (shelves: Item[][], key: string) => (
    <View style={styles.column} key={key}>
      {shelves.map((row, i) => (
        <View key={i} style={styles.shelf}>
          <View style={styles.items}>
            {row.map((item, j) => (
              <View key={j} style={{ alignItems: 'center' }}>
                {item.cap && (
                  <View
                    style={{
                      width: item.w - 3,
                      height: 4,
                      backgroundColor: item.cap,
                      borderTopLeftRadius: 2,
                      borderTopRightRadius: 2,
                    }}
                  />
                )}
                <View
                  style={{
                    width: item.w,
                    height: item.h,
                    backgroundColor: item.color,
                    borderRadius: item.radius ?? 3,
                  }}
                />
              </View>
            ))}
          </View>
          <View style={styles.shelfLine} />
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.stage}>
      {/* The open door, hinged left and angled back, so the fridge reads as
          open rather than as a cabinet drawn from the front. */}
      <View style={styles.door}>
        <View style={styles.doorInner} />
        <View style={styles.handle} />
      </View>

      <View style={styles.body}>
        <View style={styles.interior}>
          {column(LEFT, 'l')}
          <View style={styles.divider} />
          {column(RIGHT, 'r')}
        </View>
        <Animated.View style={[styles.light, { opacity: glow }]} pointerEvents="none" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: 190, height: 180, alignSelf: 'center', flexDirection: 'row' },

  door: {
    width: 30,
    height: 168,
    alignSelf: 'center',
    backgroundColor: '#EDE7DA',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#DDD4C2',
    marginRight: -4,
    alignItems: 'center',
    justifyContent: 'center',
    // Angled back and squashed horizontally: the cheapest honest way to say
    // "this panel is facing away from you" without a 3-D transform.
    transform: [{ perspective: 600 }, { rotateY: '38deg' }],
  },
  doorInner: {
    position: 'absolute',
    top: 10, bottom: 10, left: 6, right: 6,
    backgroundColor: '#F6F2E9',
    borderRadius: 5,
  },
  handle: {
    position: 'absolute',
    right: 4,
    width: 3,
    height: 34,
    borderRadius: 2,
    backgroundColor: '#C3B9A6',
  },

  body: {
    flex: 1,
    height: 180,
    backgroundColor: '#FBFAF7',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#E2DACB',
    overflow: 'hidden',
  },
  interior: { flex: 1, flexDirection: 'row', padding: 7 },
  divider: { width: 2, backgroundColor: '#EFE9DC', borderRadius: 1, marginHorizontal: 5 },
  column: { flex: 1, justifyContent: 'space-between' },
  shelf: { flex: 1, justifyContent: 'flex-end' },
  items: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 4 },
  shelfLine: { height: 2, backgroundColor: '#E7E0D2', borderRadius: 1, marginTop: 2 },

  light: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.orange },
});
