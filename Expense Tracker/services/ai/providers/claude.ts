import { DEFAULT_AI_MODEL } from '@/constants/aiModels';
import { buildReceiptExtractionPrompt, type ReceiptExtraction } from '@/services/ai/prompts';
import type { AiResult, SimpleChatMessage } from '@/types/ai';
import { parseJsonResponse } from './shared';

const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };
type Message = { role: 'user' | 'assistant'; content: string | ContentBlock[] };

async function callMessages(
  body: { model: string; max_tokens: number; system?: string; messages: Message[] },
  apiKey: string
): Promise<AiResult<any>> {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        // Lets this run against the web preview target too; on native mobile
        // this header is a no-op since there's no browser CORS involved.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401) return { ok: false, error: { type: 'invalid_key' } };
    if (res.status === 429) return { ok: false, error: { type: 'rate_limited' } };
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: { type: 'unknown', message: text || `Request failed (${res.status}).` } };
    }
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, error: { type: 'network', message: 'Could not reach the Claude API.' } };
  }
}

function extractText(data: any): string {
  const blocks = data?.content ?? [];
  return blocks
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim();
}

export async function sendChatMessage(
  systemPrompt: string,
  history: SimpleChatMessage[],
  apiKey: string,
  model?: string
): Promise<AiResult<string>> {
  const result = await callMessages(
    {
      model: model || DEFAULT_AI_MODEL.claude,
      max_tokens: 1024,
      system: systemPrompt,
      messages: history.map((h) => ({ role: h.role, content: h.text })),
    },
    apiKey
  );
  if (!result.ok) return result;
  return { ok: true, data: extractText(result.data) };
}

export async function extractReceiptFromImage(
  base64: string,
  mimeType: string,
  apiKey: string,
  model?: string
): Promise<AiResult<ReceiptExtraction>> {
  const result = await callMessages(
    {
      model: model || DEFAULT_AI_MODEL.claude,
      max_tokens: 512,
      system: buildReceiptExtractionPrompt(),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            { type: 'text', text: 'Extract the expense details from this receipt photo.' },
          ],
        },
      ],
    },
    apiKey
  );
  if (!result.ok) return result;
  return parseJsonResponse<ReceiptExtraction>(extractText(result.data));
}
