import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { extractInstagramUrl, extractTikTokUrl } from '../lib/shareHandler';
import { COLORS, FONTS } from '../lib/theme';

// Landing screen for the share sheet ("Share to SpoonDrop" from Instagram,
// TikTok, a browser…). It never renders for long: as soon as the native
// payload arrives we hand it to the normal import flow and replace ourselves in
// the history, so Back doesn't return to a spinner.
//
// Only links/text are accepted — see the `expo-share-intent` activation rules in
// app.json. Instagram's share sheet hands over the reel's URL, not the video
// file, which is exactly what the import pipeline already knows how to chew on.
export default function ShareIntentScreen() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  // The provider can emit the same intent more than once (mount + native event);
  // routing twice would stack two import screens.
  const handled = useRef(false);

  useEffect(() => {
    if (!hasShareIntent || handled.current) return;

    // `webUrl` is set when the source app shared a proper link (iOS). Android
    // delivers everything as text, so fall back to scanning it for a URL.
    const raw = shareIntent.webUrl ?? shareIntent.text ?? '';
    const url = extractInstagramUrl(raw) ?? extractTikTokUrl(raw) ?? shareIntent.webUrl;

    handled.current = true;
    resetShareIntent();

    if (url) {
      router.replace({ pathname: '/cookbook/import', params: { sharedUrl: url } });
    } else if (raw.trim()) {
      // Not a link we recognise — could still be a pasted recipe caption, which
      // the import screen can run through the text extractor.
      router.replace({ pathname: '/cookbook/import', params: { sharedText: raw } });
    } else {
      router.replace('/');
    }
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.orange} />
      <Text style={styles.text}>Opening your recipe…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream, justifyContent: 'center', alignItems: 'center', gap: 14 },
  text: { fontFamily: FONTS.body, fontSize: 15, color: COLORS.warmGray },
});
