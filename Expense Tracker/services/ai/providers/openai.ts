import { DEFAULT_AI_MODEL } from '@/constants/aiModels';
import {
  buildCompanyIdentificationPrompt,
  buildReceiptExtractionPrompt,
  type CompanyIdentification,
  type ReceiptExtraction,
} from '@/services/ai/prompts';
import type { AiResult, SimpleChatMessage } from '@/types/ai';
import { parseJsonResponse } from './shared';

const API_URL = 'https://api.openai.com/v1/chat/completions';

type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
type Message = { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] };

async function callChat(messages: Message[], apiKey: string, model?: string): Promise<AiResult<any>> {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: model || DEFAULT_AI_MODEL.openai, max_tokens: 1024, messages }),
    });
    if (res.status === 401) return { ok: false, error: { type: 'invalid_key' } };
    if (res.status === 429) return { ok: false, error: { type: 'rate_limited' } };
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: { type: 'unknown', message: text || `Request failed (${res.status}).` } };
    }
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, error: { type: 'network', message: 'Could not reach the OpenAI API.' } };
  }
}

function extractText(data: any): string {
  return (data?.choices?.[0]?.message?.content ?? '').trim();
}

export async function sendChatMessage(
  systemPrompt: string,
  history: SimpleChatMessage[],
  apiKey: string,
  model?: string
): Promise<AiResult<string>> {
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((h) => ({ role: h.role, content: h.text }) as Message),
  ];
  const result = await callChat(messages, apiKey, model);
  if (!result.ok) return result;
  return { ok: true, data: extractText(result.data) };
}

export async function extractReceiptFromImage(
  base64: string,
  mimeType: string,
  apiKey: string,
  model?: string
): Promise<AiResult<ReceiptExtraction>> {
  const messages: Message[] = [
    { role: 'system', content: buildReceiptExtractionPrompt() },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Extract the expense details from this receipt photo.' },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
      ],
    },
  ];
  const result = await callChat(messages, apiKey, model);
  if (!result.ok) return result;
  return parseJsonResponse<ReceiptExtraction>(extractText(result.data));
}

export async function identifyCompanyFromImage(
  base64: string,
  mimeType: string,
  apiKey: string,
  model?: string
): Promise<AiResult<CompanyIdentification>> {
  const messages: Message[] = [
    { role: 'system', content: buildCompanyIdentificationPrompt() },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Which company or brand made this product?' },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
      ],
    },
  ];
  const result = await callChat(messages, apiKey, model);
  if (!result.ok) return result;
  return parseJsonResponse<CompanyIdentification>(extractText(result.data));
}
