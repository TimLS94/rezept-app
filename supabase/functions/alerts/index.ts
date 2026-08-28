// Sends what has gone wrong, to wherever you actually look.
//
// The dashboard is a pull: it answers "how are things" for someone who
// thought to ask. This is the push, and it is the half that matters at
// two in the morning on a Saturday.
//
// A webhook rather than email, because every chat app takes one and none of
// them need an account, a domain or a sending reputation. Slack, Discord and
// Teams all accept a POST with a `text` field; anything else gets the full
// JSON and can do what it likes with it.
//
// With no webhook configured this still runs and still records what fired, so
// the dashboard shows it. That is deliberately worse than being told and
// deliberately better than nothing — and it means setting this up is one
// secret, not a prerequisite.
//
//   npx supabase secrets set ALERT_WEBHOOK_URL=https://hooks.slack.com/...
//   npx supabase functions deploy alerts
//
// Called on a schedule (see the cron block at the bottom of alerts.sql), or by
// hand with the shared secret.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const secret = Deno.env.get('ALERT_SECRET');
  const url = new URL(req.url);

  // Anyone can reach an edge function, so this needs its own door. Without a
  // secret configured it refuses rather than running openly: an endpoint that
  // reveals what is broken is a reconnaissance tool.
  if (!secret) return json({ error: 'not_configured' }, 503);
  const given = req.headers.get('x-alert-secret') ?? url.searchParams.get('secret');
  if (given !== secret) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await admin.rpc('pending_alerts');
  if (error) return json({ error: error.message }, 500);

  const alerts: any[] = data?.alerts ?? [];
  if (alerts.length === 0) {
    return json({ ok: true, sent: 0, open: (data?.all ?? []).length });
  }

  const webhook = Deno.env.get('ALERT_WEBHOOK_URL');
  if (!webhook) {
    // Recorded but not delivered. Said plainly in the response rather than
    // returning ok and letting someone believe it was sent.
    return json({ ok: true, sent: 0, recorded: alerts.length, note: 'no ALERT_WEBHOOK_URL set' });
  }

  const icon = (s: string) => (s === 'high' ? '🔴' : s === 'medium' ? '🟠' : '🟡');
  const text = [
    `*SpoonDrop* — ${alerts.length} new alert${alerts.length === 1 ? '' : 's'}`,
    ...alerts.map(a => `${icon(a.severity)} *${a.title}*\n${a.detail}`),
  ].join('\n\n');

  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, alerts }),
  });

  return json({ ok: res.ok, sent: res.ok ? alerts.length : 0, status: res.status });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
