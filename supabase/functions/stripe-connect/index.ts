// Creator payouts via Stripe Connect.
//
// Two actions:
//   { action: 'onboard' } → returns a URL where the creator enters their bank
//                           details and identity documents. Creates the
//                           connected account on first call.
//   { action: 'status'  } → whether Stripe has finished verifying them and
//                           payouts are actually possible.
//
// Runs server-side because it needs the Stripe SECRET key, and because
// `profiles.stripe_connect_id` / `payouts_enabled` are deliberately not
// client-writable (see supabase/harden_profiles.sql) — a creator marking
// themselves payout-ready would be a nice way to get paid without ever proving
// who they are.
//
// UNTIL THE KEY IS SET this returns { status: 'not_configured' } and writes
// nothing. That is the expected state, not an error: the app shows payouts as
// pending setup rather than pretending an account exists.
//
// Required function secret:
//   STRIPE_SECRET_KEY   (Stripe Dashboard → Developers → API keys, "sk_...")
// Optional:
//   PAYOUT_RETURN_URL   where Stripe sends the creator back (defaults to the
//                       app scheme, feedfamily://creator/earnings)
//
// Deploy:  npx supabase functions deploy stripe-connect
// Secret:  npx supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE = 'https://api.stripe.com/v1';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const returnUrl = Deno.env.get('PAYOUT_RETURN_URL') ?? 'feedfamily://creator/earnings';

  const authHeader = req.headers.get('Authorization') || '';
  const asUser = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);

  if (!stripeKey) return json({ status: 'not_configured' });

  const admin = createClient(supabaseUrl, service);
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_connect_id, payouts_enabled, email')
    .eq('id', user.id)
    .single();

  const body = await req.json().catch(() => ({}));
  const action = body?.action === 'status' ? 'status' : 'onboard';
  let accountId: string | null = profile?.stripe_connect_id ?? null;

  // ── status ───────────────────────────────────────────────────────────────
  if (action === 'status') {
    if (!accountId) return json({ status: 'none' });
    const acc = await stripe(stripeKey, `accounts/${accountId}`, 'GET');
    if (!acc.ok) return json({ status: 'error', detail: acc.detail });

    const ready = !!acc.data.payouts_enabled;
    // Mirror Stripe's verdict onto the profile so the app doesn't have to ask
    // Stripe on every screen. Stripe stays the source of truth.
    if (ready !== profile?.payouts_enabled) {
      await admin.from('profiles').update({ payouts_enabled: ready }).eq('id', user.id);
    }
    return json({
      status: ready ? 'ready' : 'pending',
      // What Stripe is still waiting for — the useful half of "pending".
      requirements: acc.data.requirements?.currently_due ?? [],
    });
  }

  // ── onboard ──────────────────────────────────────────────────────────────
  if (!accountId) {
    const created = await stripe(stripeKey, 'accounts', 'POST', {
      type: 'express',
      email: profile?.email ?? user.email ?? '',
      'capabilities[transfers][requested]': 'true',
      'business_type': 'individual',
    });
    if (!created.ok) return json({ status: 'error', detail: created.detail });
    accountId = created.data.id;
    await admin.from('profiles').update({ stripe_connect_id: accountId }).eq('id', user.id);
  }

  const link = await stripe(stripeKey, 'account_links', 'POST', {
    account: accountId!,
    refresh_url: returnUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });
  if (!link.ok) return json({ status: 'error', detail: link.detail });

  return json({ status: 'onboarding', url: link.data.url });
});

// Stripe's API is form-encoded, not JSON.
async function stripe(key: string, path: string, method: 'GET' | 'POST', form?: Record<string, string>) {
  const res = await fetch(`${STRIPE}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const text = await res.text();
  if (!res.ok) return { ok: false as const, detail: text.slice(0, 400), data: null as any };
  return { ok: true as const, detail: '', data: JSON.parse(text) };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
