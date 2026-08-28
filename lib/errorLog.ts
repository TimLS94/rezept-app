// Where crashes go.
//
// The app had no crash reporting of any kind: no Sentry, no error boundary,
// no global handler. So "it crashed sometimes" arrived as a sentence from a
// tester with nothing attached — and App Store Connect's native crash logs
// show a JavaScript error as a frame inside the engine, which says the app
// died without saying where or why.
//
// This is deliberately plain: a table, an insert, and never a throw of its
// own. Reporting a crash is the one thing that must not be able to cause one,
// so every failure in here is swallowed.
//
// It is not a replacement for Sentry. Sentry is a native module and would
// need a new build; this is what can ship over the air today, and it answers
// the only question that matters right now — what is actually breaking.
import { Platform } from 'react-native';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { supabase } from './supabase';

export type ErrorKind = 'render' | 'js' | 'promise' | 'handled';

/** The last screen we know the user was on, for context on a crash. */
let currentScreen: string | null = null;
export function noteScreen(name: string) {
  currentScreen = name;
}

// One message repeated in a loop would otherwise write thousands of rows from
// a single broken render. Same message twice inside a minute is one row.
const recent = new Map<string, number>();
const DEDUPE_MS = 60_000;

export async function reportError(
  kind: ErrorKind,
  error: unknown,
  extra?: Record<string, unknown>,
): Promise<void> {
  try {
    const err = error as any;
    const message = String(err?.message ?? err ?? 'unknown').slice(0, 500);

    const key = `${kind}:${message}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < DEDUPE_MS) return;
    recent.set(key, now);

    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('app_errors').insert({
      user_id: user?.id ?? null,
      kind,
      message,
      stack: String(err?.stack ?? '').slice(0, 4000) || null,
      screen: currentScreen,
      app_version: Constants.expoConfig?.version ?? null,
      // Which bundle was running. Without this, "fixed in the last update" and
      // "still happening" are indistinguishable in the data.
      update_id: Updates.isEnabled
        ? (Updates.isEmbeddedLaunch ? 'embedded' : Updates.updateId ?? null)
        : 'dev',
      platform: Platform.OS,
      extra: extra ?? null,
    });
  } catch {
    // Reporting a crash must never cause one. If this fails, it fails
    // silently and the app carries on doing whatever it was doing.
  }
}

/**
 * Catch what nothing else catches.
 *
 * ErrorUtils is React Native's own hook for an exception that reached the top
 * of the stack — in a release build that is a crash, and this is the last
 * moment anything can be recorded about it. The original handler is still
 * called afterwards, so behaviour is unchanged; we only get to watch.
 */
export function installGlobalErrorHandlers(): void {
  const g = global as any;

  if (g.ErrorUtils?.setGlobalHandler && !g.__spoondropHandlerInstalled) {
    const previous = g.ErrorUtils.getGlobalHandler?.();
    g.ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
      reportError('js', error, { isFatal: !!isFatal });
      previous?.(error, isFatal);
    });
    g.__spoondropHandlerInstalled = true;
  }

  // A rejected promise nobody handled. Not fatal by itself, but it is how a
  // screen ends up stuck — which is exactly what happened with the import.
  if (typeof g.addEventListener === 'function' && !g.__spoondropRejectionInstalled) {
    g.addEventListener('unhandledrejection', (e: any) => {
      reportError('promise', e?.reason ?? e);
    });
    g.__spoondropRejectionInstalled = true;
  }
}
