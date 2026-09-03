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
