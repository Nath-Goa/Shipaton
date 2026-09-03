import { getBestFreeOpenRouterModel } from '@/services/ai/openRouterModels';
import type { ReceiptExtraction } from '@/services/ai/prompts';
import type { AiResult, SimpleChatMessage } from '@/types/ai';

// Second shared fallback, raced against Gemini in services/ai/client.ts —
// text-only. Every request is pinned to a live-verified $0 ":free" model
// (see openRouterModels.ts); the `model` param BYOK chat sends is ignored
// on purpose, since the whole point of this provider is "one of our own
// verified-free picks," never an arbitrary caller-supplied model string.
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

type Message = { role: 'system' | 'user' | 'assistant'; content: string };

async function callChat(messages: Message[], apiKey: string): Promise<AiResult<any>> {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: getBestFreeOpenRouterModel(), max_tokens: 1024, messages }),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: { type: 'invalid_key' } };
    if (res.status === 429) return { ok: false, error: { type: 'rate_limited' } };
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: { type: 'unknown', message: text || `Request failed (${res.status}).` } };
    }
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, error: { type: 'network', message: 'Could not reach OpenRouter.' } };
  }
}

function extractText(data: any): string {
  return (data?.choices?.[0]?.message?.content ?? '').trim();
}

export async function sendChatMessage(
  systemPrompt: string,
  history: SimpleChatMessage[],
  apiKey: string
): Promise<AiResult<string>> {
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((h) => ({ role: h.role, content: h.text }) as Message),
  ];
  const result = await callChat(messages, apiKey);
  if (!result.ok) return result;
  return { ok: true, data: extractText(result.data) };
}

// Intentionally unsupported: free OpenRouter models are frequently
// text-only, so receipt image extraction never races through here — it
// always goes straight to Gemini (see raceEligible in client.ts). This
// stub exists only so this module still satisfies the shared ProviderClient
// shape; it's never actually called.
export async function extractReceiptFromImage(): Promise<AiResult<ReceiptExtraction>> {
  return { ok: false, error: { type: 'unknown', message: 'Receipt extraction is not supported on this provider.' } };
}
