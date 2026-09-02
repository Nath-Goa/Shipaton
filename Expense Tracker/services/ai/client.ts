import { getApiKey } from '@/services/ai/apiKey';
import type { ReceiptExtraction } from '@/services/ai/prompts';
import * as claude from '@/services/ai/providers/claude';
import * as gemini from '@/services/ai/providers/gemini';
import * as openai from '@/services/ai/providers/openai';
import { parseJsonResponse } from '@/services/ai/providers/shared';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { AiProvider, AiResult, SimpleChatMessage } from '@/types/ai';

// Dispatches to whichever provider the user picked in Settings, using their
// own key for that provider. Screens call this — never a provider file
// directly — so they don't need to know which provider is active.

function clientFor(provider: AiProvider) {
  switch (provider) {
    case 'openai':
      return openai;
    case 'gemini':
      return gemini;
    case 'claude':
    default:
      return claude;
  }
}

// Optional shared key so AI features work with zero setup instead of hard
// requiring BYOK. Gemini specifically: Google AI Studio hands out a free-tier
// key instantly with no billing setup, unlike Claude/OpenAI — the fastest
// "free API key" to actually go get, which is why it's the fallback
// provider regardless of which provider the user has selected. It's a
// shared key (rate-limited across every install using it), so a personal
// key is still the better experience — see hasSharedFallback().
const FALLBACK_PROVIDER: AiProvider = 'gemini';
const FALLBACK_API_KEY = process.env.EXPO_PUBLIC_SHARED_GEMINI_API_KEY;

export function hasSharedFallback(): boolean {
  return !!FALLBACK_API_KEY;
}

async function resolveKey(): Promise<{ provider: AiProvider; apiKey: string } | null> {
  const provider = useSettingsStore.getState().aiProvider;
  const personalKey = await getApiKey(provider);
  if (personalKey) return { provider, apiKey: personalKey };
  if (FALLBACK_API_KEY) return { provider: FALLBACK_PROVIDER, apiKey: FALLBACK_API_KEY };
  return null;
}

export async function sendChatMessage(
  systemPrompt: string,
  history: SimpleChatMessage[]
): Promise<AiResult<string>> {
  const resolved = await resolveKey();
  if (!resolved) return { ok: false, error: { type: 'missing_key' } };
  return clientFor(resolved.provider).sendChatMessage(systemPrompt, history, resolved.apiKey);
}

export async function extractReceiptFromImage(
  base64: string,
  mimeType: string
): Promise<AiResult<ReceiptExtraction>> {
  const resolved = await resolveKey();
  if (!resolved) return { ok: false, error: { type: 'missing_key' } };
  return clientFor(resolved.provider).extractReceiptFromImage(base64, mimeType, resolved.apiKey);
}

// Single-turn "ask for JSON matching this shape" helper, reused by quiz
// generation, pattern detection, and narrative scenarios — anywhere we want
// a structured object back instead of free-form chat text.
export async function sendStructuredPrompt<T>(systemPrompt: string, userPrompt: string): Promise<AiResult<T>> {
  const result = await sendChatMessage(systemPrompt, [{ role: 'user', text: userPrompt }]);
  if (!result.ok) return result;
  return parseJsonResponse<T>(result.data);
}
