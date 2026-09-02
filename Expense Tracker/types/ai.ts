export type AiProvider = 'claude' | 'openai' | 'gemini';

export type AiErrorType = 'missing_key' | 'invalid_key' | 'rate_limited' | 'network' | 'unknown';
export type AiError = { type: AiErrorType; message?: string };
export type AiResult<T> = { ok: true; data: T } | { ok: false; error: AiError };

export type SimpleChatMessage = { role: 'user' | 'assistant'; text: string };

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  claude: 'Claude (Anthropic)',
  openai: 'OpenAI',
  gemini: 'Gemini (Google)',
};
