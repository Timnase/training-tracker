import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Allow the GitHub Pages deployment and local dev server.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── Validation ───────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

// ─── Prompt ───────────────────────────────────────────────────────────────────

const IMAGE_PROMPT = `You are a workout plan extractor. Look at this image and extract any workout plan data you can see.

Return ONLY plain text in this exact format (no markdown, no explanation):

Plan Name Here

Workout Day Name
Exercise Name 4x8-12
Exercise Name 3x10
Another Exercise 3x12

Another Day Name
Exercise Name 4x6

Rules:
- First line: plan name (infer from context, e.g. the heading or title)
- Workout section headers are plain text lines with no "NxReps" pattern
- Each exercise line must be: "Exercise Name SetsxReps" e.g. "Bench Press 4x8"
- If sets/reps are not visible, use 3x10 as a default
- Skip warm-ups, cool-downs, and non-exercise text

If no workout plan is found in the image, respond with exactly: NO_PLAN_FOUND`;

// ─── Helper ───────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // ── 1. Authenticate — only logged-in app users may call this ──────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    // ── 2. Validate input ─────────────────────────────────────────────────────
    const body = await req.json() as { base64?: string; mimeType?: string };
    const { base64, mimeType } = body;

    if (!base64 || typeof base64 !== 'string') {
      return json({ error: 'Missing or invalid base64 image data' }, 400);
    }
    if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
      return json({ error: 'Unsupported image type. Use JPEG, PNG, GIF, or WebP.' }, 400);
    }

    // ── 3. Call Anthropic ─────────────────────────────────────────────────────
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'API key not configured on server' }, 500);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            { type: 'text',  text: IMAGE_PROMPT },
          ],
        }],
      }),
    });

    if (!res.ok) {
      return json({ error: `Claude API error: ${res.status}` }, 502);
    }

    // ── 4. Return extracted text ──────────────────────────────────────────────
    const claude = await res.json() as { content?: { type: string; text: string }[] };
    const text   = (claude.content?.find(c => c.type === 'text')?.text ?? '').slice(0, 8000);

    return json({ text });

  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
