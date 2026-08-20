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
  | 'estimate-nutrition';

/** The gateway's answer for a Gemini call: the raw text plus why it stopped. */
export type GeminiReply = { text: string; finishReason: string | null };

/**
 * Call an operation. Errors come back as values, never thrown — every caller
 * here already has a fallback path (a caption, a screenshot, the manual
 * editor), and an exception would skip it.
 */
export async function callGateway<T = any>(
  op: GatewayOp,
  payload: Record<string, unknown> = {},
): Promise<GatewayResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke('ai-gateway', {
      body: { op, ...payload },
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
    return { ok: false, error: e?.message ?? 'gateway-unreachable' };
  }
}

async function readErrorBody(error: any): Promise<string | null> {
  try {
    const body = await error?.context?.json?.();
    return body?.error ? String(body.error) : null;
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
