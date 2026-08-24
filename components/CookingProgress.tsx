// A wait you can read, for work that gives no progress of its own.
//
// The video import is one request out and one answer back — there is no
// percentage coming from anywhere, so a bar here is an estimate and nothing
// more. That is still worth far more than a number counting upwards: a count
// tells you how long you have waited, which is the one thing you already
// know. An estimate tells you whether to keep holding the phone.
//
// Two rules keep it honest. It is built from the reel's actual length, not
// from a shrug — a 30-second clip and a two-minute one get different
// estimates. And it never claims to be finished: it eases towards 95% and
// waits there, because the only thing that can say "done" is the answer
// arriving. A bar that hits 100% and then keeps spinning is a lie people
// remember.
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { COLORS, FONTS } from '../lib/theme';

/**
 * Roughly how long a reel takes to fetch, encode and watch.
 *
 * Fixed overhead for the round trip and the download, plus time proportional
 * to the footage. Deliberately generous: an estimate that runs out early is
 * worse than one that finishes ahead of itself.
 */
export function estimateSeconds(videoSeconds?: number): number {
  const footage = Math.min(videoSeconds ?? 45, 120);
  return Math.round(25 + footage * 1.2);
}

const STAGES = [
  { until: 0.18, icon: '📥', label: 'Fetching the reel' },
  { until: 0.45, icon: '👀', label: 'Watching it' },
  { until: 0.80, icon: '📝', label: 'Reading the steps' },
  { until: 1.00, icon: '🍽️', label: 'Plating it up' },
];

export default function CookingProgress({
  seconds, done,
}: {
  /** The estimate this bar should pace itself against. */
  seconds: number;
  /** Set once the answer is in, so the bar can finish honestly. */
  done?: boolean;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [stage, setStage] = useState(0);

  useEffect(() => {
    // Ease out rather than run linearly: the last stretch is the model
    // thinking, which is the part that varies most, so slowing down there
    // matches what actually happens.
    Animated.timing(progress, {
      toValue: 0.95,
      duration: seconds * 1000,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [seconds, progress]);

  useEffect(() => {
    if (!done) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      useNativeDriver: false,
    }).start();
  }, [done, progress]);

  useEffect(() => {
    // One listener, and setState only when the stage actually changes —
    // otherwise this re-renders on every animation frame.
    const id = progress.addListener(({ value }) => {
      const found = STAGES.findIndex(s => value <= s.until);
      setStage(prev => {
        const next = found === -1 ? STAGES.length - 1 : found;
        return next === prev ? prev : next;
      });
    });
    return () => progress.removeListener(id);
  }, [progress]);

  const current = STAGES[stage];
  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.wrap}>
      <Text style={styles.stage}>
        {current.icon}  {current.label}…
      </Text>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width }]} />
      </View>
      <Text style={styles.note}>
        About {seconds < 60 ? `${seconds} seconds` : `${Math.round(seconds / 60)} minutes`} for
        a reel this long. It is an estimate, not a countdown.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', paddingHorizontal: 24, marginTop: 22, alignItems: 'center' },
  stage: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.navy, marginBottom: 12 },
  track: {
    width: '100%', height: 10, borderRadius: 6,
    backgroundColor: '#F0E8DC', overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 6, backgroundColor: COLORS.orange },
  note: { fontSize: 12, color: COLORS.warmGray, textAlign: 'center', marginTop: 12, lineHeight: 17 },
});
