/// <reference types="vite/client" />

// ─── Claude API key ───────────────────────────────────────────────────────────
// The Anthropic API key is stored as a Supabase Secret (ANTHROPIC_API_KEY) and
// used only inside the `scan-image` Edge Function (supabase/functions/scan-image/).
// It is never bundled into client JS.
//
// To configure it:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-…
//   supabase functions deploy scan-image

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ImportMetaEnv {}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
