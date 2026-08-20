// How many recipe imports are left this week.
//
// Two buckets, because the two kinds do not cost the same: pulling an
// Instagram post costs a scraper call on top of the AI call and is the one
// path where a single tap in another app spends one of ours, so it gets three
// a week — the same as the fridge scan. A screenshot or pasted text is one AI
// call and nothing else, so it gets ten. Spending the Instagram three does
// not touch the ten.
//
// Both numbers come from the database, which is also where they are enforced.
// The client-side check exists only to avoid spending an AI call we already
// know will be refused.
import { supabase } from './supabase';

/** Which allowance an import comes out of. */
export type ImportKind = 'instagram' | 'screenshot' | 'camera' | 'text';

export const INSTAGRAM_LIMIT = 3; // per rolling 7 days, enforced in the DB
export const OTHER_LIMIT = 10;

export type ImportQuota = {
  kind: string;
  limit: number;
  used: number;
  remaining: number;
  resets_at: string | null;
};

export function limitFor(kind: ImportKind): number {
  return kind === 'instagram' ? INSTAGRAM_LIMIT : OTHER_LIMIT;
}

const permissive = (kind: ImportKind): ImportQuota => ({
  kind,
  limit: limitFor(kind),
  used: 0,
  remaining: limitFor(kind),
  resets_at: null,
});

/**
 * Imports left in the current window for this kind.
 *
 * Falls back to a permissive answer when the lookup fails, so a hiccup — or a
 * database that has not run import_quota.sql yet — never locks a paying user
 * out of a feature they bought. record_import re-checks anyway.
 */
export async function getImportQuota(kind: ImportKind): Promise<ImportQuota> {
  const { data, error } = await supabase.rpc('import_quota', { p_kind: kind });
  if (error || !data) return permissive(kind);
  return data as ImportQuota;
}

/** Books a completed import. This is what actually enforces the allowance. */
export async function recordImport(kind: ImportKind): Promise<ImportQuota & { ok: boolean }> {
  const { data, error } = await supabase.rpc('record_import', { p_kind: kind });
  if (error || !data) return { ok: true, ...permissive(kind) };
  return data as ImportQuota & { ok: boolean };
}

/** "Two of three Instagram imports left", or when the next one frees up. */
export function quotaText(q: ImportQuota): string {
  const what = q.kind === 'instagram' ? 'Instagram imports' : 'imports';
  if (q.remaining > 0) return `${q.remaining} of ${q.limit} ${what} left this week`;
  if (!q.resets_at) return `You get ${q.limit} ${what} every 7 days.`;
  const days = Math.max(
    1,
    Math.ceil((new Date(q.resets_at).getTime() - Date.now()) / 86_400_000),
  );
  return days === 1
    ? `No ${what} left — one frees up tomorrow.`
    : `No ${what} left — one frees up in ${days} days.`;
}
