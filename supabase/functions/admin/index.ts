// The dashboard.
//
// A page rather than a screen in the app, because this is not for users: it
// is for whoever is on the hook when something breaks, and they are usually
// at a laptop. It lives as an edge function for the same reason the share
// page does — that is an https address we already have, with no second
// service to run and no domain to buy.
//
// Access is the user's own login. You paste the access token the app already
// holds, and every figure comes from admin_health(), which checks the admin
// role in the database. So this page has no privileges of its own: it renders
// what the caller is allowed to see, and for anyone who is not an admin that
// is nothing.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const COOKIE = 'sd_admin';

/** The token, from the cookie a previous sign-in set. */
function tokenFromCookie(req: Request): string {
  const raw = req.headers.get('cookie') ?? '';
  const hit = raw.split(';').map(c => c.trim()).find(c => c.startsWith(`${COOKIE}=`));
  return hit ? decodeURIComponent(hit.slice(COOKIE.length + 1)) : '';
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const hours = Math.max(1, Math.min(Number(url.searchParams.get('hours') ?? 24), 720));

  // Signing out is one link, and it has to work even when everything else on
  // the page is failing.
  if (url.searchParams.get('out') === '1') {
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.pathname,
        'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
      },
    });
  }

  // The form posts the token; it never travels in a URL. A query string ends
  // up in browser history, in bookmarks and in the logs of anything between
  // here and there, and this token is a full login.
  if (req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    const posted = String(form?.get('token') ?? '').trim();
    if (!posted) return html(loginPage('Paste a token first.'));
    return new Response(null, {
      status: 303,
      headers: {
        Location: url.pathname,
        // HttpOnly: the page itself never needs to read it, so script on the
        // page cannot either. An hour, because a Supabase access token does
        // not outlive that anyway.
        'Set-Cookie':
          `${COOKIE}=${encodeURIComponent(posted)}; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Strict`,
      },
    });
  }

  const token = tokenFromCookie(req);
  if (!token) return html(loginPage());

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data, error } = await supabase.rpc('admin_health', { p_hours: hours });
  if (error) return html(message('Could not load', error.message), 500);
  if (!data?.ok) {
    return html(
      message(
        data?.error === 'not_admin' ? 'Not an admin account' : 'Could not load',
        data?.error === 'not_admin'
          ? 'That token belongs to an account without the admin role.'
          : String(data?.error ?? 'unknown'),
      ),
      403,
    );
  }

  return html(dashboard(data, hours));
});

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Never cached, anywhere. A stale dashboard is worse than none: it says
      // everything is fine using numbers from before it stopped being fine.
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

const SHELL = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} · SpoonDrop</title>
<style>
 :root{color-scheme:light dark}
 body{margin:0;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
      background:#FFF9F2;color:#1A1A1A}
 .wrap{max-width:1080px;margin:0 auto;padding:28px 20px 60px}
 h1{font-size:24px;color:#0D2B63;margin:0 0 4px}
 .sub{color:#8A8378;font-size:13px;margin-bottom:24px}
 .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:28px}
 .card{background:#fff;border:1px solid #EFE7DC;border-radius:14px;padding:14px 16px}
 .card .n{font-size:26px;font-weight:800;color:#0D2B63}
 .card .l{font-size:12px;color:#8A8378;margin-top:2px}
 h2{font-size:16px;color:#0D2B63;margin:28px 0 10px}
 table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #EFE7DC;border-radius:14px;overflow:hidden}
 th,td{text-align:left;padding:10px 12px;font-size:13px;border-bottom:1px solid #F4EEE5;vertical-align:top}
 th{background:#FFF3E9;color:#8A4B1E;font-weight:700;font-size:12px}
 tr:last-child td{border-bottom:none}
 .bad{color:#B0402A;font-weight:700}
 .ok{color:#3C8D40;font-weight:700}
 .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#6b6459}
 .empty{color:#8A8378;font-size:13px;padding:14px 0}
 .range a{display:inline-block;margin-right:8px;color:#F2701E;text-decoration:none;font-weight:600;font-size:13px}
 input{width:100%;padding:12px;border:1px solid #EFE7DC;border-radius:10px;font-size:14px;background:#fff;color:inherit}
 button{background:#F2701E;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-weight:700;font-size:14px;margin-top:10px;cursor:pointer}
 @media (prefers-color-scheme:dark){
   body{background:#14110E;color:#F5F0E8} h1,h2,.card .n{color:#F5F0E8}
   .card,table,input{background:#1E1A16;border-color:#2E2823} th{background:#2A231C;color:#E8B98C}
   td{border-color:#2A2621}
 }
</style></head><body><div class="wrap">${body}</div></body></html>`;

function loginPage(note?: string) {
  return SHELL('Dashboard', `
   <h1>SpoonDrop dashboard</h1>
   <p class="sub">Paste an admin access token. It is your own login — the database checks the role, not this page.</p>
   ${note ? `<p class="sub" style="color:#B0402A">${esc(note)}</p>` : ''}
   <form method="post">
     <input name="token" placeholder="access token" autocomplete="off" autofocus>
     <button type="submit">Open</button>
   </form>
   <p class="sub" style="margin-top:22px">
     In the app: Settings → Admin dashboard → Copy access token. It lasts an hour.
   </p>`);
}

function message(title: string, detail: string) {
  return SHELL(title, `<h1>${esc(title)}</h1><p class="sub">${esc(detail)}</p>`);
}

function dashboard(d: any, hours: number) {
  const u = d.usage ?? {};
  const m = d.money ?? {};
  const money = (c: number) => `$${((c ?? 0) / 100).toFixed(2)}`;

  const card = (n: unknown, l: string) => `<div class="card"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div></div>`;

  const ops = (d.ops ?? []).map((o: any) => `<tr>
    <td class="mono">${esc(o.op)}</td>
    <td>${esc(o.calls)}</td>
    <td class="${Number(o.failure_rate) > 10 ? 'bad' : 'ok'}">${esc(o.failure_rate)}%</td>
    <td>${esc(o.p50_ms ?? '—')} / ${esc(o.p95_ms ?? '—')} ms</td>
    <td class="mono">${esc(o.top_error ?? '')}</td></tr>`).join('');

  const errors = (d.errors ?? []).map((e: any) => `<tr>
    <td>${esc(e.message)}</td>
    <td class="mono">${esc(e.kind)}</td>
    <td>${esc(e.count)}</td>
    <td>${esc(e.users)}</td>
    <td class="mono">${esc(String(e.update_id ?? '').slice(0, 8))}</td>
    <td class="mono">${esc(String(e.last_seen ?? '').slice(0, 16).replace('T', ' '))}</td></tr>`).join('');

  const range = [24, 72, 168, 720]
    .map(h => `<a href="?hours=${h}">${h === 24 ? '24h' : h === 72 ? '3d' : h === 168 ? '7d' : '30d'}</a>`)
    .join('') + ' <a href="?out=1" style="color:#8A8378">sign out</a>';

  return SHELL('Dashboard', `
    <h1>SpoonDrop</h1>
    <p class="sub">Last ${hours} hours · generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</p>
    <p class="range">${range}</p>

    <div class="cards">
      ${card(u.total_users ?? 0, 'users total')}
      ${card(u.signups ?? 0, 'new sign-ups')}
      ${card(u.cooks ?? 0, 'meals cooked')}
      ${card(u.imports ?? 0, 'recipe imports')}
      ${card(u.fridge_scans ?? 0, 'fridge scans')}
      ${card(m.active_premium ?? 0, 'premium active')}
      ${card(money(m.gross_cents), 'gross taken')}
      ${card(m.payouts_pending ?? 0, 'payouts pending')}
    </div>

    <h2>AI gateway</h2>
    ${ops
      ? `<table><tr><th>operation</th><th>calls</th><th>failing</th><th>p50 / p95</th><th>top error</th></tr>${ops}</table>`
      : '<p class="empty">No calls in this window. If that is a surprise, it is the finding.</p>'}

    <h2>App errors</h2>
    ${errors
      ? `<table><tr><th>message</th><th>kind</th><th>seen</th><th>users</th><th>bundle</th><th>last</th></tr>${errors}</table>`
      : '<p class="empty">Nothing reported. Either it is quiet, or app_errors.sql has not been run.</p>'}

    <p class="sub" style="margin-top:30px">
      ${esc(m.comped ?? 0)} comped account(s) still active — clear these before launch.
    </p>`);
}
