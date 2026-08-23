// Client side of the AI gateway.
//
// The app holds no AI keys any more. Everything that costs money goes through
// one edge function, which checks the signed-in user and spends a daily quota
// before calling Gemini, Groq or RapidAPI.
//
// See supabase/functions/ai-gateway/index.ts.
import { supabase } from './supabase';

export type GatewayResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type GatewayOp =
  | 'recipe-from-text'
  | 'recipe-from-images'
  | 'fridge-items'
  | 'instagram-post'
  | 'transcribe-video'
  | 'recipe-from-video'
  | 'estimate-nutrition';

/** The gateway's answer for a Gemini call: the raw text plus why it stopped. */
export type GeminiReply = { text: string; finishReason: string | null };

/**
 * Call an operation. Errors come back as values, never thrown — every caller
 * here already has a fallback path (a caption, a screenshot, the manual
 * editor), and an exception would skip it.
 */
/**
 * How long each operation is given before we stop waiting.
 *
 * Nothing had a timeout, and fetch on React Native has no default one, so an
 * edge function that died — or a model that took longer than the platform
 * allows — left the app on a spinner forever. Forever is not a state a user
 * can do anything with.
 *
 * The numbers are what the work actually needs, not a single safe-looking
 * constant: reading a caption is one quick call, watching a whole reel is a
 * download, an upload and a model that samples every frame.
 */
const TIMEOUT_MS: Partial<Record<GatewayOp, number>> = {
  'recipe-from-video': 180_000,
  'transcribe-video': 120_000,
  'recipe-from-images': 90_000,
};
const DEFAULT_TIMEOUT_MS = 45_000;

export async function callGateway<T = any>(
  op: GatewayOp,
  payload: Record<string, unknown> = {},
  /** Lets a screen offer a Cancel button that actually cancels. */
  externalSignal?: AbortSignal,
): Promise<GatewayResult<T>> {
  const controller = new AbortController();
  const limit = TIMEOUT_MS[op] ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), limit);
  externalSignal?.addEventListener('abort', () => controller.abort());

  try {
    const { data, error } = await supabase.functions.invoke('ai-gateway', {
      body: { op, ...payload },
      signal: controller.signal,
    });

    if (error) {
      // invoke() reports any non-2xx as an error, so the useful detail —
      // "quota_exceeded", "too-large" — is in the response body, not the
      // message. Without reading it the app would say "something went wrong"
      // when it could say "you've used today's imports".
      const detail = await readErrorBody(error);
      return { ok: false, error: detail ?? error.message ?? 'gateway-failed' };
    }
    if (data?.error) return { ok: false, error: String(data.error) };
    return { ok: true, data: data as T };
  } catch (e: any) {
    // An abort is either our deadline or the user's Cancel, and the two want
    // different words: one is "this took too long", the other is "you stopped
    // it" and does not deserve an error at all.
    if (e?.name === 'AbortError' || /abort/i.test(e?.message ?? '')) {
      return { ok: false, error: externalSignal?.aborted ? 'cancelled' : 'timeout' };
    }
    return { ok: false, error: e?.message ?? 'gateway-unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

/** True when the caller stopped it themselves — say nothing, just go back. */
export const isCancelled = (error: string) => error === 'cancelled';

async function readErrorBody(error: any): Promise<string | null> {
  try {
    const body = await error?.context?.json?.();
    if (!body?.error) return null;
    // Some errors carry a "when" with them. Passing it through the error
    // string keeps the value type unchanged while letting a caller that
    // cares — the Instagram one does — say when instead of "for now".
    // `reason` qualifies the code without replacing it, so a build that only
    // knows the code still lands on a sensible message.
    const code = String(body.error);
    return body.reason ? `${code}:${String(body.reason)}` : code;
  } catch {
    return null;
  }
}


/** True when the failure was the daily cap rather than a real fault. */
export function isQuotaError(error: string): boolean {
  return error === 'quota_exceeded';
}

export const QUOTA_MESSAGE =
  "You've used today's AI imports. They reset tomorrow — you can still add recipes by hand.";
