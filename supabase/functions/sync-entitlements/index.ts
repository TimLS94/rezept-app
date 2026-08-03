// Pull-based entitlement sync: the app calls this after a purchase/restore (and
// on demand). It asks RevenueCat about the signed-in user and writes their
// platform entitlement into Supabase, so the server-side content gate unlocks.
//
// Required function secrets:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//   REVENUECAT_SECRET_KEY   (RevenueCat → Project settings → API keys → Secret key, sk_...)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ENTITLEMENT = 'Cook_App Pro'; // must match RevenueCat entitlement id + the app

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const rcSecret = Deno.env.get('REVENUECAT_SECRET_KEY');

  // Identify the caller from their JWT.
  const authHeader = req.headers.get('Authorization') || '';
  const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);
  if (!rcSecret) return json({ error: 'not_configured', active: false });

  // Ask RevenueCat about this user's entitlements.
  const rc = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`, {
    headers: { Authorization: `Bearer ${rcSecret}` },
  });
  if (!rc.ok) return json({ active: false, error: `revenuecat_http_${rc.status}` });
  const body = await rc.json().catch(() => null);
  const allEnts = body?.subscriber?.entitlements ?? {};
  const ent = allEnts[ENTITLEMENT];
  const active = !!ent && (!ent.expires_date || new Date(ent.expires_date).getTime() > Date.now());

  // Upsert the platform entitlement (service role bypasses RLS).
  const admin = createClient(url, service);
  const { data: existing } = await admin.from('entitlements')
    .select('id').eq('user_id', user.id).eq('scope', 'platform').is('creator_id', null).maybeSingle();

  const row = {
    user_id: user.id,
    scope: 'platform',
    creator_id: null,
    product_id: ent?.product_identifier ?? null,
    rc_app_user_id: user.id,
    status: active ? 'active' : 'expired',
    current_period_end: ent?.expires_date ?? null,
    updated_at: new Date().toISOString(),
  };
  let writeError: string | undefined;
  if (existing) {
    const { error } = await admin.from('entitlements').update(row).eq('id', existing.id);
    writeError = error?.message;
  } else if (active) {
    const { error } = await admin.from('entitlements').insert(row);
    writeError = error?.message;
  }

  // Diagnostics: what the sync saw (app_user_id, which entitlements RevenueCat
  // returned) so mismatches are easy to spot during setup.
  return json({
    active,
    error: writeError ?? (active ? undefined : (ent ? 'expired' : 'no_entitlement')),
    app_user_id: user.id,
    entitlements_seen: Object.keys(allEnts),
    looking_for: ENTITLEMENT,
  });
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
