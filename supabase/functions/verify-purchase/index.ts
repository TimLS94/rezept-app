// Unlocks are granted here, against a receipt, or not at all.
//
// The app used to call grant_platform_entitlement(), grant_recipe_purchase()
// and grant_creator_entitlement() directly. Those functions check exactly one
// thing — that you are signed in — and then hand out Premium or a paid recipe.
// Anyone who could register could unlock everything by calling an HTTP
// endpoint. This function replaces all three: it asks RevenueCat what the user
// actually bought and only then writes, using the service role.
//
// Secrets: REVENUECAT_SECRET_KEY (and the standard SUPABASE_* set).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ENTITLEMENT = 'premium';
const STORE_FEE = 0.15; // App Store Small Business Program

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

type Subscriber = {
  entitlements?: Record<string, { expires_date?: string | null; product_identifier?: string }>;
  subscriptions?: Record<string, { expires_date?: string | null }>;
  non_subscriptions?: Record<string, Array<{ id: string; purchase_date: string }>>;
};

async function fetchSubscriber(userId: string, secret: string): Promise<Subscriber | null> {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return body?.subscriber ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const rcSecret = Deno.env.get('REVENUECAT_SECRET_KEY');

  const authHeader = req.headers.get('Authorization') || '';
  const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'bad_json' }, 400); }

  const admin0 = createClient(url, service);

  // ── Development unlock ──────────────────────────────────────────────────
  // Testing needs a way to turn Premium on without a store receipt: with a
  // RevenueCat test key there is never a receipt to verify, so every paid
  // feature would be untestable.
  //
  // The switch is a function secret, not a flag in the app. That is the whole
  // point — the old dev path was a client call to a function that granted
  // Premium to anyone who asked, and the only thing between it and production
  // was a __DEV__ check compiled into the binary. Here the server decides, it
  // is off unless ALLOW_DEV_UNLOCK is explicitly "true", and turning it off is
  // a config change rather than a release.
  if (body.dev === true) {
    if (Deno.env.get('ALLOW_DEV_UNLOCK') !== 'true') {
      return json({ ok: false, error: 'dev_unlock_disabled' }, 403);
    }
    const row = {
      user_id: user.id,
      scope: 'platform',
      creator_id: null,
      product_id: 'dev_unlock',
      rc_app_user_id: user.id,
      status: 'active',
      current_period_end: new Date(Date.now() + 32 * 864e5).toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data: existing } = await admin0.from('entitlements')
      .select('id').eq('user_id', user.id).eq('scope', 'platform').is('creator_id', null).maybeSingle();
    if (existing) await admin0.from('entitlements').update(row).eq('id', existing.id);
    else await admin0.from('entitlements').insert(row);
    return json({ ok: true, dev: true });
  }

  // No key means we cannot verify anything. Refusing is the only safe answer:
  // falling back to "grant it anyway" is precisely the hole this closes.
  if (!rcSecret) return json({ ok: false, error: 'not_configured' }, 503);

  const subscriber = await fetchSubscriber(user.id, rcSecret);
  if (!subscriber) return json({ ok: false, error: 'revenuecat_unavailable' }, 502);

  const admin = createClient(url, service);
  const kind = String(body.kind ?? '');

  // ── App Premium ─────────────────────────────────────────────────────────
  if (kind === 'platform') {
    const ent = subscriber.entitlements?.[ENTITLEMENT];
    const active = !!ent && (!ent.expires_date || new Date(ent.expires_date).getTime() > Date.now());
    if (!active) return json({ ok: false, error: 'no_active_entitlement' }, 402);

    const row = {
      user_id: user.id,
      scope: 'platform',
      creator_id: null,
      product_id: ent?.product_identifier ?? null,
      rc_app_user_id: user.id,
      status: 'active',
      current_period_end: ent?.expires_date ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data: existing } = await admin.from('entitlements')
      .select('id').eq('user_id', user.id).eq('scope', 'platform').is('creator_id', null).maybeSingle();
    if (existing) await admin.from('entitlements').update(row).eq('id', existing.id);
    else await admin.from('entitlements').insert(row);

    return json({ ok: true });
  }

  // ── A single paid recipe ────────────────────────────────────────────────
  if (kind === 'recipe') {
    const recipeId = String(body.recipeId ?? '');
    const productId = String(body.productId ?? '');
    if (!recipeId || !/^recipe_unlock_\d{3}$/.test(productId)) {
      return json({ ok: false, error: 'bad_request' }, 400);
    }

    // Tier products carry a price, not a recipe id — RevenueCat cannot tell us
    // *which* recipe was bought. So we count instead: the store says how many
    // times this tier was purchased, the database says how many unlocks were
    // already spent at that tier. One more purchase than spent means this
    // request is paid for. Replaying the call a second time finds the counts
    // equal and is refused.
    const purchases = subscriber.non_subscriptions?.[productId]?.length ?? 0;
    if (purchases === 0) return json({ ok: false, error: 'no_purchase_found' }, 402);

    const priceCents = Number(productId.slice(-3));
    const { count: spent } = await admin
      .from('recipe_purchases')
      .select('recipe_id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('price_cents', priceCents);

    // Already own this exact recipe: nothing to do, and nothing to charge.
    const { data: owned } = await admin
      .from('recipe_purchases')
      .select('recipe_id').eq('user_id', user.id).eq('recipe_id', recipeId).maybeSingle();
    if (owned) return json({ ok: true, already: true });

    if (purchases <= (spent ?? 0)) return json({ ok: false, error: 'no_unspent_purchase' }, 402);

    const { data: recipe } = await admin
      .from('recipes').select('influencer_id').eq('id', recipeId).maybeSingle();
    if (!recipe) return json({ ok: false, error: 'recipe_not_found' }, 404);

    const { data: snapRow } = await admin.from('recipes').select('*').eq('id', recipeId).single();
    const { error: insErr } = await admin.from('recipe_purchases').insert({
      user_id: user.id,
      recipe_id: recipeId,
      creator_id: recipe.influencer_id,
      price_cents: priceCents,
      recipe_snapshot: snapRow,
    });
    if (insErr) return json({ ok: false, error: insErr.message }, 500);

    await admin.from('purchase_events').insert({
      user_id: user.id,
      event_type: 'RECIPE_PURCHASE',
      product_id: productId,
      price_cents: priceCents,
      net_cents: Math.round(priceCents * (1 - STORE_FEE)),
      currency: 'USD',
      creator_id: recipe.influencer_id,
      occurred_at: new Date().toISOString(),
    });

    return json({ ok: true });
  }

  // ── A subscription to one creator ───────────────────────────────────────
  if (kind === 'creator') {
    const creatorId = String(body.creatorId ?? '');
    const productId = String(body.productId ?? '');
    if (!creatorId || !/^creator_sub_\d{3}$/.test(productId)) {
      return json({ ok: false, error: 'bad_request' }, 400);
    }

    const sub = subscriber.subscriptions?.[productId];
    const active = !!sub && (!sub.expires_date || new Date(sub.expires_date).getTime() > Date.now());
    if (!active) return json({ ok: false, error: 'no_active_subscription' }, 402);

    // NOTE: a store subscription product can only be active once per account,
    // so this tier can back exactly one creator at a time. Subscribing to a
    // second creator at the same price is not expressible in the current
    // product catalogue — it needs per-creator products or a single product
    // plus server-side creator selection.
    const { data: existing } = await admin.from('entitlements')
      .select('id').eq('user_id', user.id).eq('scope', 'creator').eq('creator_id', creatorId).maybeSingle();

    const row = {
      user_id: user.id,
      scope: 'creator',
      creator_id: creatorId,
      product_id: productId,
      rc_app_user_id: user.id,
      status: 'active',
      current_period_end: sub?.expires_date ?? null,
      updated_at: new Date().toISOString(),
    };
    if (existing) await admin.from('entitlements').update(row).eq('id', existing.id);
    else await admin.from('entitlements').insert(row);

    return json({ ok: true });
  }

  return json({ ok: false, error: 'unknown_kind' }, 400);
});
