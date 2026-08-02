// RevenueCat webhook → Supabase.
// Writes entitlements (access) + purchase_events (revenue) with the service-role
// key so it bypasses RLS. Configure in RevenueCat → Integrations → Webhooks:
//   URL:     https://<project-ref>.functions.supabase.co/revenuecat-webhook
//   Header:  Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>
//
// Required function secrets (supabase secrets set ...):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REVENUECAT_WEBHOOK_SECRET
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Net proceeds assumptions (Germany). Adjust per market if needed.
const VAT_RATE = 0.19;       // 19 % USt (Apple/Google remit this)
const STORE_FEE = 0.15;      // Small-Business 15 % (use 0.30 above $1M/yr)

const ACTIVE = ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE'];

Deno.serve(async (req) => {
  // 1. Auth: shared secret in the Authorization header.
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  const auth = req.headers.get('Authorization') || '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response('Bad Request', { status: 400 }); }
  const e = body?.event;
  if (!e) return new Response('No event', { status: 400 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const userId: string | undefined = e.app_user_id;
  const type: string = e.type;
  const priceCents = e.price != null ? Math.round(Number(e.price) * 100) : null;
  const netCents = priceCents != null
    ? Math.round((priceCents / (1 + VAT_RATE)) * (1 - STORE_FEE))
    : null;
  const store = e.store === 'APP_STORE' ? 'app_store' : e.store === 'PLAY_STORE' ? 'play_store' : (e.store ?? null);
  const periodEnd = e.expiration_at_ms ? new Date(e.expiration_at_ms).toISOString() : null;
  const occurredAt = e.purchased_at_ms ? new Date(e.purchased_at_ms).toISOString() : new Date().toISOString();

  // 2. Revenue audit (immutable) — only for money-moving events.
  if (priceCents && priceCents > 0 && userId) {
    await supabase.from('purchase_events').insert({
      user_id: userId,
      event_type: type,
      product_id: e.product_id ?? null,
      store,
      price_cents: priceCents,
      net_cents: netCents,
      currency: e.currency ?? 'EUR',
      occurred_at: occurredAt,
      raw: e,
    });
  }

  // 3. Entitlement (access). Phase 1: app-wide 'platform' scope.
  if (userId) {
    let status: string | null = null;
    if (ACTIVE.includes(type)) status = 'active';
    else if (type === 'BILLING_ISSUE') status = 'grace';
    else if (type === 'EXPIRATION') status = 'expired';
    else if (type === 'CANCELLATION') status = null; // auto-renew off, keep access until expiry

    if (status) {
      // Manual upsert: onConflict can't dedupe on a NULL creator_id, so match the
      // existing platform row by hand and update it, otherwise insert.
      const row = {
        user_id: userId,
        scope: 'platform',
        creator_id: null,
        product_id: e.product_id ?? null,
        store,
        rc_app_user_id: userId,
        status,
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      };
      const { data: existing } = await supabase
        .from('entitlements')
        .select('id')
        .eq('user_id', userId)
        .eq('scope', 'platform')
        .is('creator_id', null)
        .maybeSingle();
      if (existing) {
        await supabase.from('entitlements').update(row).eq('id', existing.id);
      } else {
        await supabase.from('entitlements').insert(row);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
});
