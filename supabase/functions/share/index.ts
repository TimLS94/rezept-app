// The page a shared recipe link points at.
//
// Sharing was sending `spoondrop://s/<token>`, and a custom scheme is not a
// link as far as WhatsApp, iMessage or Mail are concerned — they linkify
// http and https and leave everything else as grey text. So the recipient got
// a message with an unclickable string in it, and no preview, because a
// preview is something a web page provides and there was no web page.
//
// This is the web page. It lives as an edge function because that is an https
// address we already have, and it does three things a share needs:
//
//   1. It is tappable, being https.
//   2. It carries Open Graph tags, so the chat app shows the recipe's photo
//      and title instead of a bare URL.
//   3. It opens the app when the app is installed, and explains itself when
//      it is not.
//
// When spoondrop.app exists this moves behind it and becomes a universal
// link — app/+native-intent.ts already routes the https form, so that switch
// needs no new native build.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APP_SCHEME = 'spoondrop://';

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // /functions/v1/share/<token>
  const token = url.pathname.split('/').filter(Boolean).pop() ?? '';
  if (!token || token === 'share') return html(notFound(), 404);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data } = await supabase.rpc('get_recipe_share', { p_token: token });
  if (!data?.ok) return html(notFound(), 404);

  let title = 'A recipe on SpoonDrop';
  let description = '';
  let image = '';

  if (data.kind === 'mine' && data.payload) {
    title = String(data.payload.title ?? title);
    description = String(data.payload.description ?? '');
    image = String(data.payload.image_url ?? '');
  } else if (data.recipe_id) {
    const { data: recipe } = await supabase
      .from('recipes')
      .select('title, description, image_url')
      .eq('id', data.recipe_id)
      .single();
    if (recipe) {
      title = recipe.title ?? title;
      description = recipe.description ?? '';
      image = recipe.image_url ?? '';
    }
  }

  const sharedBy = String(data.shared_by ?? 'Someone');
  const deepLink = `${APP_SCHEME}s/${token}`;

  return html(page({ title, description, image, sharedBy, deepLink }));
});

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Chat apps cache previews hard. An hour is long enough to spare the
      // database a hammering and short enough that a corrected recipe photo
      // shows up the same day.
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

function page(r: {
  title: string; description: string; image: string; sharedBy: string; deepLink: string;
}): string {
  const desc = r.description || `${r.sharedBy} shared this recipe with you on SpoonDrop.`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(r.title)} · SpoonDrop</title>
<meta name="description" content="${escape(desc)}">

<!-- What the chat app reads to build the preview card. Without these it
     shows a bare URL, which is what a shared recipe looked like before. -->
<meta property="og:type" content="article">
<meta property="og:title" content="${escape(r.title)}">
<meta property="og:description" content="${escape(desc)}">
${r.image ? `<meta property="og:image" content="${escape(r.image)}">` : ''}
<meta name="twitter:card" content="${r.image ? 'summary_large_image' : 'summary'}">

<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #FFF9F2; color: #1A1A1A; display: flex; justify-content: center;
  }
  .card { max-width: 460px; width: 100%; padding: 24px; }
  .hero { width: 100%; aspect-ratio: 16/10; object-fit: cover; border-radius: 18px; background: #F0EAE0; }
  .from { color: #F2701E; font-weight: 700; font-size: 13px; margin: 20px 0 6px; }
  h1 { font-size: 26px; margin: 0 0 8px; color: #0D2B63; }
  p.desc { color: #6b6459; margin: 0 0 24px; }
  a.btn {
    display: block; text-align: center; text-decoration: none;
    background: #F2701E; color: #fff; font-weight: 700;
    padding: 17px; border-radius: 14px; margin-bottom: 12px;
  }
  a.alt { display:block; text-align:center; color:#0D2B63; text-decoration:none; font-weight:600; padding:12px; }
  .note { font-size: 13px; color: #8A8378; text-align: center; margin-top: 18px; line-height: 1.6; }
  @media (prefers-color-scheme: dark) {
    body { background: #14110E; color: #F5F0E8; }
    h1 { color: #F5F0E8; } p.desc { color: #b8b0a4; }
    a.alt { color: #F5F0E8; }
  }
</style>
</head><body>
<div class="card">
  ${r.image ? `<img class="hero" src="${escape(r.image)}" alt="">` : '<div class="hero"></div>'}
  <div class="from">${escape(r.sharedBy)} shared a recipe with you</div>
  <h1>${escape(r.title)}</h1>
  <p class="desc">${escape(desc)}</p>

  <a class="btn" href="${escape(r.deepLink)}">Open in SpoonDrop</a>
  <a class="alt" href="https://apps.apple.com/app/id0000000000">Don't have the app? Get SpoonDrop</a>

  <p class="note">
    Opening it in the app adds the recipe to your own cookbook — your copy, yours to change.
  </p>
</div>
<script>
  // Try the app straight away on a phone. If it is installed the page is
  // replaced by it; if not, nothing happens and the buttons above are still
  // there, which is why this is an attempt rather than a redirect.
  if (/iPhone|iPad|Android/i.test(navigator.userAgent)) {
    setTimeout(function () { window.location.href = ${JSON.stringify(r.deepLink)}; }, 350);
  }
</script>
</body></html>`;
}

function notFound(): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Link not found · SpoonDrop</title></head>
<body style="font:16px -apple-system,sans-serif;background:#FFF9F2;color:#1A1A1A;text-align:center;padding:60px 24px">
<div style="font-size:44px">🔗</div>
<h1 style="color:#0D2B63">This link has expired</h1>
<p style="color:#6b6459">The recipe was unshared, or the link was mistyped.</p>
</body></html>`;
}
