// Turns a shopping list into an Instacart shopping-list page and returns the
// link. The user opens it, picks a store, and everything is already in the cart.
//
// This lives server-side for one reason: the Instacart key must not ship inside
// the app. EXPO_PUBLIC_* keys are readable by anyone who unpacks the IPA/APK —
// the Gemini and Groq keys in this project already have that problem, and a
// billing-capable commerce key would be a much worse one to repeat.
//
// Required function secret:
//   INSTACART_API_KEY   (Instacart Developer Dashboard → API keys, "keys.…")
// Optional:
//   INSTACART_API_BASE  (defaults to production; set to the dev host to test)
//
// Deploy:  npx supabase functions deploy instacart-list
// Secret:  npx supabase secrets set INSTACART_API_KEY=keys.xxxxxxxx
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Item = {
  name: string;
  displayText?: string;
  quantity?: number;
  unit?: string;
};

const DEFAULT_BASE = 'https://connect.instacart.com';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const apiKey = Deno.env.get('INSTACART_API_KEY');
  const base = Deno.env.get('INSTACART_API_BASE') ?? DEFAULT_BASE;

  // Only signed-in users, so the endpoint can't be used as a free relay.
  const authHeader = req.headers.get('Authorization') || '';
  const asUser = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);

  // Distinct from a failure: the caller falls back to the plain search link.
  if (!apiKey) return json({ error: 'not_configured' }, 200);

  const body = await req.json().catch(() => null);
  const items: Item[] = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return json({ error: 'no_items' }, 400);

  const payload = {
    title: typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : 'My shopping list',
    link_type: 'shopping_list',
    expires_in: 30,                      // days; Instacart allows up to 365
    line_items: items.slice(0, 100).map(i => ({
      name: i.name,
      ...(i.displayText ? { display_text: i.displayText } : {}),
      // `quantity`/`unit` on the line item itself are deprecated — Instacart
      // wants measurements as an array so it can pick the one that best maps
      // onto an actual product.
      ...(i.quantity && i.unit
        ? { line_item_measurements: [{ quantity: i.quantity, unit: i.unit }] }
        : {}),
    })),
  };

  const res = await fetch(`${base}/idp/v1/products/products_link`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    // Surface Instacart's own message — "invalid key" and "bad line item" need
    // very different fixes, and a generic failure hides which one you have.
    return json({ error: `instacart_http_${res.status}`, detail: text.slice(0, 500) }, 200);
  }

  const data = JSON.parse(text);
  const url = data?.products_link_url;
  if (!url) return json({ error: 'no_link_in_response', detail: text.slice(0, 500) }, 200);

  return json({ url });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
