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

export async function sendChatMessage(
  systemPrompt: string,
  history: SimpleChatMessage[]
): Promise<AiResult<string>> {
  const provider = useSettingsStore.getState().aiProvider;
  const apiKey = await getApiKey(provider);
  if (!apiKey) return { ok: false, error: { type: 'missing_key' } };
  return clientFor(provider).sendChatMessage(systemPrompt, history, apiKey);
}

export async function extractReceiptFromImage(
  base64: string,
  mimeType: string
): Promise<AiResult<ReceiptExtraction>> {
  const provider = useSettingsStore.getState().aiProvider;
  const apiKey = await getApiKey(provider);
  if (!apiKey) return { ok: false, error: { type: 'missing_key' } };
  return clientFor(provider).extractReceiptFromImage(base64, mimeType, apiKey);
}

// Single-turn "ask for JSON matching this shape" helper, reused by quiz
// generation, pattern detection, and narrative scenarios — anywhere we want
// a structured object back instead of free-form chat text.
export async function sendStructuredPrompt<T>(systemPrompt: string, userPrompt: string): Promise<AiResult<T>> {
  const result = await sendChatMessage(systemPrompt, [{ role: 'user', text: userPrompt }]);
  if (!result.ok) return result;
  return parseJsonResponse<T>(result.data);
}
