import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../lib/theme';

/**
 * The launch animation: a drop falls from the spoon, lands, and splashes into
 * the wordmark. It is the name acted out — SpoonDrop.
 *
 * Built on React Native's own Animated with the native driver, so it runs on
 * the UI thread and stays smooth while JS is still busy booting the app. No
 * Lottie, no reanimated: one screen does not justify another native dependency,
 * and this has to work on the very first frame, before anything else is ready.
 *
 * `onDone` fires when the animation finishes. The caller decides whether the
 * app is ready — the animation never blocks longer than it takes to play.
 */
export default function SplashDrop({ onDone }: { onDone: () => void }) {
  const drop = useRef(new Animated.Value(0)).current;    // fall, 0 → 1
  const splash = useRef(new Animated.Value(0)).current;  // impact
  const word = useRef(new Animated.Value(0)).current;    // wordmark
  const fade = useRef(new Animated.Value(1)).current;    // whole screen out

  useEffect(() => {
    Animated.sequence([
      Animated.delay(120),
      // Accelerating fall — gravity, not a linear slide. `Easing.in(quad)` is
      // what makes it read as falling rather than travelling.
      Animated.timing(drop, {
        toValue: 1, duration: 460, easing: Easing.in(Easing.quad), useNativeDriver: true,
      }),
      Animated.parallel([
        // The splash overshoots and settles: a spring, not a fade.
        Animated.spring(splash, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
        Animated.timing(word, {
          toValue: 1, duration: 380, delay: 60, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
      ]),
      Animated.delay(420),
      Animated.timing(fade, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start(({ finished }) => finished && onDone());
  }, []);

  return (
    <Animated.View style={[styles.fill, { opacity: fade }]} pointerEvents="none">
      <View style={styles.stage}>
        <View style={styles.spoonBowl} />
        <View style={styles.spoonHandle} />

        <Animated.View
          style={[
            styles.drop,
            {
              transform: [
                { translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [0, 120] }) },
                // Stretches as it accelerates, the way a falling droplet does.
                { scaleY: drop.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1.5, 1.1] }) },
              ],
              opacity: drop.interpolate({ inputRange: [0, 0.05, 0.92, 1], outputRange: [0, 1, 1, 0] }),
            },
          ]}
        />

        <Animated.View
          style={[
            styles.splash,
            {
              transform: [{ scale: splash }],
              opacity: splash.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
            },
          ]}
        />
      </View>

      <Animated.Text
        style={[
          styles.word,
          {
            opacity: word,
            transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          },
        ]}
      >
        SPOON<Text style={styles.wordAccent}>DROP</Text>
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  stage: { height: 200, width: 120, alignItems: 'center' },
  spoonBowl: { width: 44, height: 58, borderRadius: 22, backgroundColor: COLORS.bone },
  spoonHandle: { width: 11, height: 34, borderRadius: 6, backgroundColor: COLORS.bone, marginTop: -4 },
  drop: {
    position: 'absolute', top: 92,
    width: 15, height: 15, borderRadius: 8, backgroundColor: COLORS.orange,
  },
  splash: {
    position: 'absolute', bottom: 12,
    width: 84, height: 15, borderRadius: 42, backgroundColor: COLORS.orange,
  },
  word: {
    fontFamily: FONTS.display, fontSize: 40, color: COLORS.bone,
    letterSpacing: 1, marginTop: 18,
  },
  wordAccent: { color: COLORS.orange },
});
