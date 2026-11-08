// What you are currently paying for, so it can be shown and cancelled.
//
// Until now the app took memberships and never mentioned them again. Nothing
// listed them, nothing said what they cost, and nothing led to the place they
// can be stopped — the one thing an auto-renewing charge most needs.
//
// Cancelling is Apple's, not ours: an app cannot end a store subscription,
// it can only point at the page that does. So this provides the list, and
// the caller provides the link.
import { supabase } from './supabase';
import { findCreatorSubTier } from './pricing';

export type Membership = {
  creatorId: string;
  name: string;
  handle: string | null;
  priceCents: number | null;
  renewsAt: string | null;
};

/**
 * Active creator memberships, newest first.
 *
 * Two queries rather than a join: profiles is readable column by column and
 * only for creators, so embedding it in the entitlements select would make
 * one refused column take the whole query down with it. That has happened
 * twice in this project.
 */
export async function fetchMemberships(): Promise<Membership[]> {
  const { data: rows, error } = await supabase
    .from('entitlements')
    .select('creator_id, product_id, current_period_end')
    .eq('scope', 'creator')
    .eq('status', 'active');
  if (error || !rows?.length) return [];

  const ids = rows.map(r => r.creator_id).filter(Boolean);
  const { data: people } = await supabase
    .from('profiles')
    .select('id, full_name, username')
    .in('id', ids);
  const byId = new Map((people ?? []).map(p => [p.id, p]));

  return rows.map(r => {
    const p = byId.get(r.creator_id);
    const tier = typeof r.product_id === 'string'
      ? Number(r.product_id.replace(/\D/g, '')) || null
      : null;
    return {
      creatorId: r.creator_id,
      name: p?.full_name || p?.username || 'A creator',
      handle: p?.username ?? null,
      priceCents: tier,
      renewsAt: r.current_period_end ?? null,
    };
  });
}

/** Human date for the next charge, or null when the store did not say. */
export function renewsLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}
