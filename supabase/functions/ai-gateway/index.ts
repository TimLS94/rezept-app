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

// Gemini takes a video inline, but the whole request has to stay under 20MB
// and base64 adds a third. 14MB of MP4 is the most that fits, which covers a
// normal reel comfortably and rules out the occasional four-minute one.
const VIDEO_INLINE_LIMIT = 14 * 1024 * 1024;

/**
 * Base64 in fixed chunks.
 *
 * String.fromCharCode(...bytes) on a 14MB array spreads fourteen million
 * arguments onto the stack and takes the isolate down with it.
 */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  // Collected and joined once. Appending to a string in a loop rebuilds it
  // every time, so a fourteen-megabyte file was being copied four hundred
  // times on its way to a nineteen-megabyte string — quadratic work for
  // something that should be linear, and a plausible share of the minutes
  // this call was taking.
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(''));
}

/** Instagram's own CDN, and nothing else. */
function isInstagramCdn(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return /(^|\.)cdninstagram\.com$|(^|\.)fbcdn\.net$/.test(host);
  } catch {
    return false;
  }
}

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
  "steps": ["Step 1 instruction", "Step 2 instruction", ...],
  "stepTimers": [<seconds or null for each step, same order and length as steps>],
  "cuisines": [<0-2 ids from: italian, mexican, american, chinese, japanese, thai, indian, mediterranean, greek, french, korean, vietnamese, middle-eastern, caribbean, german, bbq>],
  "equipment": [<ids from: air-fryer, blender, food-processor, stand-mixer, hand-mixer, pressure-cooker, slow-cooker, grill, thermometer, kitchen-scale, waffle-iron, ice-cream-maker, mandoline, dutch-oven, wok, piping-bag>]
}

Rules:
- Extract ALL ingredients mentioned, even if amounts are vague (estimate reasonable amounts)
- Convert spoken measurements to standard units
- Categorize ingredients correctly (meat includes fish/seafood)
- Break down instructions into clear, numbered steps
- Estimate prep/cook times if not explicitly stated
- Only include dietary tags that actually apply
- stepTimers: one entry per step, in the same order, so index 0 belongs to step 1.
  Give a number ONLY when the step contains a definite, unattended wait that a
  kitchen timer would help with — "simmer 10 minutes", "bake for 25 minutes",
  "chill 1 hour". Use null for everything else. In particular use null for
  approximations tied to an outcome ("until golden, about 5 minutes"): the cook
  is watching the pan, and a timer there rings at the wrong moment and teaches
  people to ignore it. When unsure, null. Fewer timers that are right beats more
  that are guesses.
- cuisines: ids from the list above and nothing else — never invent a value, never
  return a display name. Empty array when the source does not indicate one; do not
  infer a cuisine from a single ingredient, because soy sauce does not make a dish
  Japanese and a wrong label is worse than none. Use two only for a genuine fusion
  dish that belongs to both.
- equipment: ids from the list above and nothing else. Only what the recipe cannot
  be made without. Anything not on the list is left out rather than approximated —
  and never pans, pots, bowls, knives or an oven, which every kitchen has: a line
  listing those is one people learn to skip, and then they skip the air fryer too.
  Empty array when nothing special is needed.
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
  "steps": ["Step 1 instruction", "Step 2 instruction", ...],
  "stepTimers": [<seconds or null for each step, same order and length as steps>],
  "cuisines": [<0-2 ids from: italian, mexican, american, chinese, japanese, thai, indian, mediterranean, greek, french, korean, vietnamese, middle-eastern, caribbean, german, bbq>],
  "equipment": [<ids from: air-fryer, blender, food-processor, stand-mixer, hand-mixer, pressure-cooker, slow-cooker, grill, thermometer, kitchen-scale, waffle-iron, ice-cream-maker, mandoline, dutch-oven, wok, piping-bag>]
}

stepTimers must have one entry per step, in the same order. Use a number of seconds
only for a definite, unattended wait ("simmer 10 minutes", "bake 25 minutes"), and
null for everything else — including "until golden, about 5 minutes", where the cook
is watching rather than waiting. When unsure, null.

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

const NUTRITION_PROMPT = `You are estimating the nutrition of one serving of a recipe from its ingredient list.

Return ONLY this JSON, no markdown:
{"calories": <int>, "protein": <grams int>, "carbs": <grams int>, "fat": <grams int>}

Rules:
- Per SERVING, not for the whole recipe. Divide by the serving count given.
- Use standard reference values for each ingredient.
- Ignore anything listed "to taste" and negligible amounts of salt, pepper and water.
- If an amount is missing, assume a normal household quantity for that ingredient.
- Round to whole numbers. Never return a range, a null or an explanation.`;

// ── Gemini ────────────────────────────────────────────────────────────────
// What a full recipe costs to write out, with room to spare.
//
// 2000 was not enough and the failure was silent in the worst way: Gemini 2.5
// counts its own thinking against this budget, so a detailed recipe — fifteen
// ingredients, ten steps — ran out mid-JSON and came back as finishReason
// MAX_TOKENS with an unparseable half object. Which reads, downstream, as "no
// recipe found in this post" for a post whose caption contains the entire
// recipe. This app has now been bitten by exactly this three times: the fridge
// scan at 1000, the nutrition estimate at 600, and this.
//
// Output tokens are only billed as used, so a ceiling this high costs nothing
// on the recipes that do fit.
const RECIPE_OUTPUT_TOKENS = 8000;

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
          RECIPE_OUTPUT_TOKENS,
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
            max_tokens: RECIPE_OUTPUT_TOKENS,
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
      if (!res.ok) {
        // A 429 from RapidAPI means two very different things: the plan's
        // monthly allowance is gone (wait for the billing period, or upgrade),
        // or too many calls arrived at once (wait a minute). Collapsing both
        // into one code made an exhausted subscription look like a blip
        // someone should retry, which is how it stayed unnoticed.
        const remaining = res.headers.get('x-ratelimit-requests-remaining');
        const resetIn = Number(res.headers.get('x-ratelimit-requests-reset') ?? 0);
        const body = await res.text().catch(() => '');
        const monthly = /MONTHLY quota/i.test(body) || remaining === '0';

        if (res.status === 429) {
          // The code stays 'rapidapi-429' whatever the reason, and the reason
          // rides alongside it.
          //
          // The gateway updates the instant it is deployed; the app reaches
          // phones as an over-the-air update that only applies on the next
          // cold start. So for a while every version that ever shipped is out
          // there talking to today's gateway. Inventing a new error code
          // broke exactly that: older builds had no branch for
          // 'rapidapi-quota' and fell through to printing it raw at the user.
          // A new field is invisible to a client that does not read it; a new
          // value in a field it switches on is not.
          return json({
            error: 'rapidapi-429',
            reason: monthly ? 'quota' : 'burst',
            reset_in: Number.isFinite(resetIn) ? resetIn : null,
            limit: res.headers.get('x-ratelimit-requests-limit'),
          }, 429);
        }
        return json({ error: `rapidapi-${res.status}` }, 502);
      }
      return json({ ok: true, data: await res.json() });
    }

    // The reel itself, watched and listened to in one call.
    //
    // Transcription only ever heard the audio, which misses the case people
    // actually post: the steps written on screen while the voice says
    // something else entirely. Gemini samples the frames and reads that text,
    // and hears the narration at the same time — so this replaces the
    // caption-then-audio chain rather than adding to it.
    //
    // Pulling frames out ourselves would need ffmpeg, which is not available
    // in this runtime, or a native module in the app, which would end the
    // over-the-air path. Handing the file to a model that already understands
    // video avoids both.
    case 'recipe-from-video': {
      const videoUrl = String(body.videoUrl ?? '');
      if (!isInstagramCdn(videoUrl)) return json({ error: 'host-not-allowed' }, 400);
      if (!GEMINI_API_KEY) return json({ error: 'no-key' }, 503);

      // Timed, because "it takes minutes" is not something to guess about.
      // Three things can be slow here and they want different fixes: pulling
      // the file off Instagram's CDN, encoding it, and the model watching it.
      const t0 = Date.now();

      const head = await fetch(videoUrl, { method: 'HEAD' });
      const size = Number(head.headers.get('content-length') ?? 0);
      if (size > VIDEO_INLINE_LIMIT) return json({ error: 'too-large', size }, 413);

      const video = await fetch(videoUrl);
      if (!video.ok) return json({ error: 'download-failed' }, 502);

      const bytes = new Uint8Array(await video.arrayBuffer());
      if (bytes.length > VIDEO_INLINE_LIMIT) {
        return json({ error: 'too-large', size: bytes.length }, 413);
      }
      const downloadMs = Date.now() - t0;

      const t1 = Date.now();
      const encoded = toBase64(bytes);
      const encodeMs = Date.now() - t1;
      const t2 = Date.now();

      const caption = String(body.caption ?? '').slice(0, 4000);
      const r = await gemini(
        [
          {
            text:
              `${RECIPE_EXTRACTION_PROMPT}\n\n` +
              'Extract the recipe from this reel using everything in it together. ' +
              'Read the text shown on screen — ingredient lists and steps are often ' +
              'written there rather than spoken — listen to the narration, and combine ' +
              'both with the caption below. Each of the three may hold only part of the ' +
              'recipe: take ingredients from wherever they appear and steps from wherever ' +
              'they appear, and merge them into one complete recipe rather than reporting ' +
              'only what a single source contained.' +
              (caption ? `\n\nThe post's caption:\n${caption}` : ''),
          },
          {
            inline_data: { mime_type: 'video/mp4', data: encoded },
            // Half a frame a second, and only the first two minutes.
            //
            // Default sampling is one frame per second for the whole file,
            // and every frame is tokens the model has to look at — which is
            // where the minutes went. Text written on screen in a recipe reel
            // stays up for several seconds, so half rate loses nothing and
            // roughly halves the work. Two minutes because a reel that has
            // not shown its recipe by then is not going to.
            video_metadata: { fps: 0.5, end_offset: '120s' },
          },
        ],
        RECIPE_OUTPUT_TOKENS,
      );
      const geminiMs = Date.now() - t2;
      console.log('recipe-from-video timings', {
        bytes: bytes.length, downloadMs, encodeMs, geminiMs,
      });

      if (!r.ok) return json({ error: r.error, downloadMs, encodeMs, geminiMs }, 502);
      // The timings ride along so the app can log where a slow import went,
      // rather than everyone guessing from the outside.
      return json({ ...r, timings: { bytes: bytes.length, downloadMs, encodeMs, geminiMs } });
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

    case 'estimate-nutrition': {
      const ingredients = Array.isArray(body.ingredients) ? body.ingredients.slice(0, 60) : [];
      const servings = Math.max(1, Number(body.servings) || 1);
      if (!ingredients.length) return json({ error: 'no-ingredients' }, 400);
      if (!GEMINI_API_KEY) return json({ error: 'no-key' }, 503);

      const list = ingredients
        .map((i: any) => `${i?.amount ?? ''} ${i?.unit ?? ''} ${i?.name ?? ''}`.trim())
        .filter(Boolean)
        .join('\n');

      // 2000, not 600: Gemini 2.5 charges its reasoning against the same
      // budget, so a short ceiling gets spent thinking and the JSON comes back
      // truncated. The fridge scan hit this exact wall at 1000.
      const r = await gemini([{ text: `${NUTRITION_PROMPT}\n\nServings: ${servings}\n\nIngredients:\n${list}` }], 2000);
      return r.ok ? json(r) : json(r, 502);
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

  // Every call is recorded: which op, whether it worked, how long it took and
  // what the error code was. The platform's own log is a stream you have to
  // already be watching — it cannot be queried across days and cannot be
  // joined to anything, so "Instagram imports started failing on Tuesday" is
  // a question it cannot answer. A table can.
  //
  // Nothing from the request body is stored. No captions, no images, no
  // recipe text: an operations table that accumulates user content is a
  // liability that grows on its own, and counts plus error codes are enough
  // to see a problem.
  const started = Date.now();
  let response: Response;
  let failure: string | null = null;

  try {
    response = await runOp(op, body);
    if (!response.ok) {
      // Read the code without consuming the body the caller still needs.
      failure = await response.clone().json()
        .then((b: any) => String(b?.error ?? response.status))
        .catch(() => String(response.status));
    }
  } catch (e) {
    console.warn('ai-gateway failure', op, String(e).slice(0, 300));
    failure = 'gateway-failed';
    response = json({ error: 'gateway-failed' }, 500);
  }

  record(admin, {
    op,
    ok: failure === null,
    error: failure,
    duration_ms: Date.now() - started,
    user_id: user.id,
  });

  return response;
});

/**
 * Write one row about what just happened, and never let that get in the way.
 *
 * Fire and forget: the caller has their answer already, and a monitoring
 * insert that delayed or broke a working request would be worse than no
 * monitoring at all.
 */
function record(admin: any, row: Record<string, unknown>): void {
  const write = admin.from('service_events').insert(row).then(
    () => {},
    (e: any) => console.warn('service_events insert failed', String(e).slice(0, 200)),
  );
  // Keeps the isolate alive until the insert lands, where supported.
  (globalThis as any).EdgeRuntime?.waitUntil?.(write);
}
