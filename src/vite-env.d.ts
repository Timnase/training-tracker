/// <reference types="vite/client" />

// ─── Claude API key (optional) ────────────────────────────────────────────────
// Used by the "Scan image" feature on the Plans page to extract workout plans
// from screenshots via the Claude Vision API.
//
// How to obtain:
//   1. Sign up / log in at https://console.anthropic.com
//   2. Navigate to API Keys and generate a new key
//   3. Create .env.local in the project root and add:
//        VITE_CLAUDE_API_KEY=sk-ant-…
//
// ⚠ Security: Vite embeds every VITE_* variable into the compiled JS bundle,
//   so the key is readable by anyone who can access the deployed app.
//   For a personal/private deployment this is acceptable.
//   For a public-facing app, proxy the Claude API call through a backend so
//   the key never leaves the server.

interface ImportMetaEnv {
  readonly VITE_CLAUDE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
