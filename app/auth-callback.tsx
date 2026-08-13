import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { COLORS, FONTS, RADIUS } from '../lib/theme';

/**
 * Where Supabase sends people back to after an email confirmation or a password
 * reset. Without this route the link opened the app and landed on "Unmatched
 * Route", which looks broken even when the confirmation itself worked.
 *
 * Supabase returns its result in the URL FRAGMENT (#access_token=… or
 * #error=…), and it arrives double-encoded through the deep link (%2523 rather
 * than #), so the payload is decoded until the markers appear rather than
 * parsed straight away.
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ payload?: string }>();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    (async () => {
      const fields = parseAuthPayload(params.payload ?? '');

      // Expired or already-used link. Supabase confirmation links are
      // single-use, so a second tap on the same email lands here.
      if (fields.error || fields.error_code) {
        setError(
          fields.error_code === 'otp_expired'
            ? 'That link has expired or was already used. Request a new one by signing in again.'
            : fields.error_description?.replace(/\+/g, ' ') ?? 'This link could not be used.',
        );
        return;
      }

      if (fields.access_token && fields.refresh_token) {
        const { error: setErr } = await supabase.auth.setSession({
          access_token: fields.access_token,
          refresh_token: fields.refresh_token,
        });
        if (setErr) {
          setError(setErr.message);
          return;
        }
        await refresh();
        router.replace('/');
        return;
      }

      // Confirmed, but no session came back — that is normal for some flows.
      // Sending them to sign in is better than sitting on a spinner.
      router.replace('/login');
    })();
  }, [params.payload, refresh]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.icon}>✉️</Text>
        <Text style={styles.title}>Link not usable</Text>
        <Text style={styles.text}>{error}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/login')}>
          <Text style={styles.buttonText}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.orange} />
      <Text style={styles.text}>Finishing sign in…</Text>
    </View>
  );
}

/** Pulls the key/value pairs out of a fragment that may be encoded several times. */
function parseAuthPayload(raw: string): Record<string, string> {
  let s = raw;
  for (let i = 0; i < 3 && !/[#?]|access_token|error/.test(s); i++) {
    try { s = decodeURIComponent(s); } catch { break; }
  }
  try { s = decodeURIComponent(s); } catch { /* already decoded enough */ }

  const start = Math.max(s.indexOf('#'), s.indexOf('?'));
  const query = start >= 0 ? s.slice(start + 1) : s;

  const out: Record<string, string> = {};
  for (const pair of query.split('&')) {
    const [k, v = ''] = pair.split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return out;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 14 },
  icon: { fontSize: 48 },
  title: { fontFamily: FONTS.display, fontSize: 24, color: COLORS.navy },
  text: { fontFamily: FONTS.body, fontSize: 14.5, color: COLORS.warmGray, textAlign: 'center', lineHeight: 21 },
  button: { backgroundColor: COLORS.orange, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 24, marginTop: 8 },
  buttonText: { fontFamily: FONTS.bold, fontSize: 15, color: '#FFF' },
});
