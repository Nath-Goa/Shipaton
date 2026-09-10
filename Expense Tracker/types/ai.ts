export type AiProvider = 'claude' | 'openai' | 'gemini';

// 'age_restricted' is never recoverable by adding a key or upgrading — it
// means this account's age band disallows the call (constants/ageCompliance.ts),
// so it always carries its own explanatory message rather than reusing one
// of the "here's how to get more quota" strings.
export type AiErrorType =
  | 'missing_key'
  | 'invalid_key'
  | 'rate_limited'
  | 'network'
  | 'quota_exceeded'
  | 'age_restricted'
  | 'unknown';
export type AiError = { type: AiErrorType; message?: string };
export type AiResult<T> = { ok: true; data: T } | { ok: false; error: AiError };

export type SimpleChatMessage = { role: 'user' | 'assistant'; text: string };

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  claude: 'Claude (Anthropic)',
  openai: 'OpenAI',
  gemini: 'Gemini (Google)',
};
