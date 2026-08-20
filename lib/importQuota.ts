// How many recipe imports are left this week.
//
// The same shape as the fridge scan's allowance, for the same reason: an
// import is an AI call we pay for per use, so Premium buys the feature and
// the allowance is what keeps one account from being able to run the bill up
// without limit.
//
// Both numbers come from the database, which is also where they are enforced.
// The client-side check exists only to avoid spending an AI call we already
// know will be refused.
import { supabase } from './supabase';

export const IMPORT_LIMIT = 10; // per rolling 7 days, enforced in the DB

export type ImportQuota = {
  limit: number;
  used: number;
  remaining: number;
  resets_at: string | null;
};

const PERMISSIVE: ImportQuota = {
  limit: IMPORT_LIMIT, used: 0, remaining: IMPORT_LIMIT, resets_at: null,
};

/**
 * Imports left in the current window.
 *
 * Falls back to a permissive answer when the lookup fails, so a hiccup — or a
 * database that has not run import_quota.sql yet — never locks a paying user
 * out of a feature they bought. record_import re-checks anyway.
 */
export async function getImportQuota(): Promise<ImportQuota> {
  const { data, error } = await supabase.rpc('import_quota');
  if (error || !data) return PERMISSIVE;
  return data as ImportQuota;
}

/** Books a completed import. This is what actually enforces the allowance. */
export async function recordImport(kind: string): Promise<ImportQuota & { ok: boolean }> {
  const { data, error } = await supabase.rpc('record_import', { p_kind: kind });
  if (error || !data) return { ok: true, ...PERMISSIVE };
  return data as ImportQuota & { ok: boolean };
}

/** "Three left this week", or when the next one frees up if there are none. */
export function quotaText(q: ImportQuota): string {
  if (q.remaining > 0) {
    return `${q.remaining} of ${q.limit} imports left this week`;
  }
  if (!q.resets_at) return `You get ${q.limit} imports every 7 days.`;
  const when = new Date(q.resets_at);
  const days = Math.max(1, Math.ceil((when.getTime() - Date.now()) / 86_400_000));
  return days === 1 ? 'One frees up tomorrow.' : `One frees up in ${days} days.`;
}
