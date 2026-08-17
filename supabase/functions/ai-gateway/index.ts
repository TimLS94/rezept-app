// The only place the app's paid API keys exist.
//
// Gemini, Groq and RapidAPI used to be called straight from the phone with
// EXPO_PUBLIC_* keys, which Expo inlines into the JS bundle at build time. All
// three were recoverable from the shipped IPA by anyone who unzipped it, and
// every one of them bills us.
//
// Two rules make this a gateway rather than a proxy:
//
//   1. It requires a signed-in user and spends a per-day quota before doing
//      any paid work.
//   2. The prompts live here. The client picks an operation by name and sends
//      content; it cannot supply a prompt. Otherwise this would just be an
//      open LLM endpoint that happens to need a login.
//
// Secrets (supabase secrets set ...):
//   GEMINI_API_KEY, GROQ_API_KEY, RAPIDAPI_KEY, RAPIDAPI_HOST
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') || '';
const RAPIDAPI_KEY = Deno.env.get('RAPIDAPI_KEY') || '';
const RAPIDAPI_HOST = Deno.env.get('RAPIDAPI_HOST') || 'instagram-scraper-stable-api.p.rapidapi.com';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Whisper's hard limit. Checked before downloading so an oversized reel costs
// us a HEAD request rather than a full transfer.
const TRANSCRIBE_LIMIT = 25 * 1024 * 1024;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// ── Prompts ───────────────────────────────────────────────────────────────
// Copied verbatim from the client modules they used to live in, so behaviour
// is unchanged by the move.
const RECIPE_EXTRACTION_PROMPT = `You are a recipe extraction assistant. Extract a structured recipe from the provided content.

Return a JSON object with this exact structure:
{
  "title": "Recipe name",
  "description": "Brief appetizing description (1-2 sentences)",
  "prepTime": <number in minutes>,
  "cookTime": <number in minutes>,
  "servings": <number>,
  "calories": <estimated calories per serving>,
  "difficulty": "Easy" | "Medium" | "Hard",
  "dietary": ["healthy", "high-protein", "gluten-free", "vegetarian", "vegan", "dairy-free"],
  "ingredients": [
    {
      "name": "Ingredient name",
      "amount": <number>,
      "unit": "cup/tbsp/tsp/lb/oz/g/ml/piece/etc",
      "category": "produce" | "meat" | "dairy" | "pantry" | "bakery" | "frozen" | "other"
    }
  ],
  "steps": ["Step 1 instruction", "Step 2 instruction", ...]
}

Rules:
- Extract ALL ingredients mentioned, even if amounts are vague (estimate reasonable amounts)
- Convert spoken measurements to standard units
- Categorize ingredients correctly (meat includes fish/seafood)
- Break down instructions into clear, numbered steps
- Estimate prep/cook times if not explicitly stated
- Only include dietary tags that actually apply
- Return ONLY valid JSON, no markdown or extra text`;

const VISION_PROMPT = `Analyze this image of a recipe (screenshot from Instagram, TikTok, or similar).

Extract ALL recipe information you can see:
- Recipe title/name
- Ingredients with amounts
- Cooking steps/instructions
- Any timing information (prep time, cook time)
- Serving size if visible

Return a JSON object with this exact structure:
{
  "title": "Recipe name",
  "description": "Brief appetizing description (1-2 sentences)",
  "prepTime": <number in minutes, estimate if not shown>,
  "cookTime": <number in minutes, estimate if not shown>,
  "servings": <number, default 4 if not shown>,
  "calories": <estimated calories per serving>,
  "difficulty": "Easy" | "Medium" | "Hard",
  "dietary": ["healthy", "high-protein", "gluten-free", "vegetarian", "vegan", "dairy-free"],
  "ingredients": [
    {
      "name": "Ingredient name",
      "amount": <number>,
      "unit": "cup/tbsp/tsp/lb/oz/g/ml/piece/etc",
      "category": "produce" | "meat" | "dairy" | "pantry" | "bakery" | "frozen" | "other"
    }
  ],
  "steps": ["Step 1 instruction", "Step 2 instruction", ...]
}

If the image shows a video frame with food being prepared, describe what you see and estimate the recipe.
Return ONLY valid JSON, no markdown or extra text.`;

const FRIDGE_PROMPT = `You are looking at photos of the inside of someone's fridge, freezer or pantry.

List every distinct food ingredient you can identify with reasonable confidence.

Rules:
- Use short, generic English names ("milk", not "semi-skimmed organic milk 1L").
- Singular form ("egg", "carrot", "tomato").
- One entry per ingredient, no duplicates across the photos.
- Only actual food. Skip containers, brands, packaging text and anything you cannot identify.
- If you can see nothing edible, return an empty array.

Return ONLY a JSON array of strings, no markdown fences and no extra text.
Example: ["egg", "milk", "cheddar", "spinach", "chicken breast"]`;

// ── Gemini ────────────────────────────────────────────────────────────────
async function gemini(parts: unknown[], maxOutputTokens: number) {
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.3, maxOutputTokens },
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.warn('Gemini error', res.status, detail.slice(0, 400));
    return { ok: false as const, error: 'gemini-failed' };
  }
  const data = await res.json();
  return {
    ok: true as const,
    text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
    // The client needs this to tell "the model ran out of room" apart from
    // "there was no recipe in the picture" — they look identical otherwise.
    finishReason: data.candidates?.[0]?.finishReason ?? null,
  };
}

const imagePart = (b64: string) => ({
  inline_data: { mime_type: 'image/jpeg', data: b64 },
});

// ── Operations ────────────────────────────────────────────────────────────
// Every branch decides its own prompt and token budget. The request body only
// ever carries content.
async function runOp(op: string, body: Record<string, any>) {
  switch (op) {
    case 'recipe-from-text': {
      const content = String(body.content ?? '').slice(0, 20000);
      if (!content.trim()) return json({ error: 'empty-content' }, 400);

      // Gemini first, Groq as the fallback — the same order the client used,
      // now on this side of the network. (The old chain had an OpenAI leg too;
      // no OPENAI key was ever configured, so it never ran.)
      if (GEMINI_API_KEY) {
        const r = await gemini(
          [{ text: `${RECIPE_EXTRACTION_PROMPT}\n\nExtract a recipe from this content:\n\n${content}` }],
          2000,
        );
        if (r.ok && r.text.trim()) return json(r);
      }

      if (GROQ_API_KEY) {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: RECIPE_EXTRACTION_PROMPT },
              { role: 'user', content: `Extract a recipe from this content:\n\n${content}` },
            ],
            temperature: 0.3,
            max_tokens: 2000,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          return json({
            ok: true,
            text: data.choices?.[0]?.message?.content ?? '',
            finishReason: data.choices?.[0]?.finish_reason ?? null,
          });
        }
        console.warn('Groq error', res.status);
      }

      if (!GEMINI_API_KEY && !GROQ_API_KEY) return json({ error: 'no-key' }, 503);
      return json({ error: 'all-providers-failed' }, 502);
    }

    case 'recipe-from-images': {
      const images: string[] = Array.isArray(body.images) ? body.images.slice(0, 4) : [];
      if (!images.length) return json({ error: 'no-images' }, 400);
      if (!GEMINI_API_KEY) return json({ error: 'no-key' }, 503);
      const r = await gemini([{ text: VISION_PROMPT }, ...images.map(imagePart)], 3000);
      return r.ok ? json(r) : json(r, 502);
    }

    case 'fridge-items': {
      const images: string[] = Array.isArray(body.images) ? body.images.slice(0, 3) : [];
      if (!images.length) return json({ error: 'no-images' }, 400);
      if (!GEMINI_API_KEY) return json({ error: 'no-key' }, 503);
      // 8000, not 1000: Gemini bills thinking tokens against the same budget,
      // and a busy fridge photo spent nearly the whole allowance thinking and
      // returned JSON truncated mid-word.
      const r = await gemini([{ text: FRIDGE_PROMPT }, ...images.map(imagePart)], 8000);
      return r.ok ? json(r) : json(r, 502);
    }

    case 'instagram-post': {
      const shortcode = String(body.shortcode ?? '').trim();
      // Anchored and character-limited: this value goes into a URL we call.
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(shortcode)) return json({ error: 'bad-shortcode' }, 400);
      if (!RAPIDAPI_KEY) return json({ error: 'no-key' }, 503);
      const res = await fetch(
        `https://${RAPIDAPI_HOST}/get_media_data_v2.php?media_code=${shortcode}`,
        { headers: { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': RAPIDAPI_HOST } },
      );
      if (!res.ok) return json({ error: `rapidapi-${res.status}` }, res.status === 429 ? 429 : 502);
      return json({ ok: true, data: await res.json() });
    }

    case 'transcribe-video': {
      const videoUrl = String(body.videoUrl ?? '');
      // Only Instagram's own CDN. Without this the gateway would fetch any URL
      // a caller names, on our network — an SSRF probe with a Whisper bill.
      let host = '';
      try { host = new URL(videoUrl).hostname; } catch { return json({ error: 'bad-url' }, 400); }
      if (!/(^|\.)cdninstagram\.com$|(^|\.)fbcdn\.net$/.test(host)) {
        return json({ error: 'host-not-allowed' }, 400);
      }
      if (!GROQ_API_KEY) return json({ error: 'no-key' }, 503);

      const head = await fetch(videoUrl, { method: 'HEAD' });
      const size = Number(head.headers.get('content-length') ?? 0);
      if (size > TRANSCRIBE_LIMIT) return json({ error: 'too-large' }, 413);

      const video = await fetch(videoUrl);
      if (!video.ok) return json({ error: 'download-failed' }, 502);

      const form = new FormData();
      form.append('file', new File([await video.blob()], 'reel.mp4', { type: 'video/mp4' }));
      form.append('model', 'whisper-large-v3-turbo');
      form.append('response_format', 'json');

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        body: form,
      });
      if (!res.ok) return json({ error: `groq-${res.status}` }, 502);
      const data = await res.json();
      return json({ ok: true, text: data.text ?? '' });
    }

    default:
      return json({ error: 'unknown-op' }, 400);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Who is calling. The anon key alone is not an identity — it ships in the
  // app bundle, so anyone has it. This needs a real user token.
  const authHeader = req.headers.get('Authorization') || '';
  const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: 'bad-json' }, 400); }

  const op = String(body.op ?? '');

  // Spend the quota before doing the paid work, and count the attempt even if
  // the upstream call then fails. Counting only successes would let a caller
  // retry a failing request forever at our expense.
  const admin = createClient(url, service);
  const { data: quota, error: quotaErr } = await admin.rpc('consume_ai_quota', { p_user: user.id, p_op: op });
  if (quotaErr) {
    console.warn('quota check failed', quotaErr.message);
    return json({ error: 'quota-unavailable' }, 503);
  }
  if (!quota?.ok) {
    return json({ error: quota?.error ?? 'quota_exceeded', limit: quota?.limit }, 429);
  }

  try {
    return await runOp(op, body);
  } catch (e) {
    console.warn('ai-gateway failure', op, String(e).slice(0, 300));
    return json({ error: 'gateway-failed' }, 500);
  }
});
