import type { AiProvider } from '@/types/ai';

// Update as newer models become available per provider. These are the
// models used when a user hasn't overridden one — always the case for the
// shared free-tier fallback key (see hasSharedFallback in services/ai/client.ts),
// which is intentionally locked to its default rather than letting a
// per-device override affect the shared quota's cost.
export const DEFAULT_AI_MODEL: Record<AiProvider, string> = {
  claude: 'claude-sonnet-5',
  openai: 'gpt-4o',
  gemini: 'gemini-3.6-flash',
};

// Tried in order when the default Gemini model is overloaded (503) or
// rate-limited (429). Measured 2026-09-25 on the shared key: the default
// flash model failed a meaningful share of calls under load while both of
// these answered every time, and each model has its own free-tier quota.
// Only used when running the default model — an explicit model override is
// never silently swapped. Both accept image input (receipts, scanner).
export const GEMINI_FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest'];
