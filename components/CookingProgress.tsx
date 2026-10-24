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

export type Stage = { until: number; icon: string; label: string };

/** Watching a reel: fetch, watch, read, plate. */
export const REEL_STAGES: Stage[] = [
  { until: 0.18, icon: '📥', label: 'Fetching the reel' },
  { until: 0.45, icon: '👀', label: 'Watching it' },
  { until: 0.80, icon: '📝', label: 'Reading the steps' },
  { until: 1.00, icon: '🍽️', label: 'Plating it up' },
];

/**
 * Reading a post's caption. Shorter, and a different set of steps.
 *
 * The labels are warmer than the reel's, but each one still names the thing
 * that is actually happening at that point. A rotating list of jokes is
 * pleasant for ten seconds and infuriating at forty, because by then the
 * person wants to know whether anything is happening at all — and a line
 * that describes real work answers that while a joke does not.
 */
export const CAPTION_STAGES: Stage[] = [
  { until: 0.25, icon: '🔗', label: 'Opening the post' },
  { until: 0.55, icon: '📖', label: 'Reading the caption' },
  { until: 0.85, icon: '🔪', label: 'Chopping it into steps' },
  { until: 1.00, icon: '🍽️', label: 'Plating it up' },
];

/** Roughly how long reading a caption takes, end to end. */
export function estimateCaptionSeconds(): number {
  // The lookup is the slow half and it is allowed up to a minute; the model
  // reading a caption afterwards is quick. Generous on purpose — an estimate
  // that runs out early is worse than one that finishes ahead of itself.
  return 22;
}

/** "about 40 seconds left", and what to say once that has run out. */
function remainingLabel(left: number): string {
  if (left > 90) return `about ${Math.round(left / 60)} minutes left`;
  if (left > 45) return 'about a minute left';
  if (left > 12) return `about ${Math.round(left / 5) * 5} seconds left`;
  if (left > 3) return 'a few seconds left';
  // Past the estimate. Saying "0 seconds" next to a spinner that is still
  // going reads as broken, and a negative number reads as worse.
  return 'any moment now';
}

export default function CookingProgress({
  seconds, done, stages = REEL_STAGES,
}: {
  /** The estimate this bar should pace itself against. */
  seconds: number;
  /** Set once the answer is in, so the bar can finish honestly. */
  done?: boolean;
  /** Which set of steps to narrate. */
  stages?: Stage[];
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [stage, setStage] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Counted here rather than read off the animation: the bar eases, so its
  // position is not proportional to time and would give a countdown that
  // slows down as it goes.
  useEffect(() => {
    if (done) return;
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [done]);

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
      const found = stages.findIndex(s => value <= s.until);
      setStage(prev => {
        const next = found === -1 ? stages.length - 1 : found;
        return next === prev ? prev : next;
      });
    });
    return () => progress.removeListener(id);
  }, [progress, stages]);

  const current = stages[stage];
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
        {done ? 'Done' : remainingLabel(seconds - elapsed)} — an estimate, not a countdown.
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
