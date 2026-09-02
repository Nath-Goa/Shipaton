import { buildReceiptExtractionPrompt, type ReceiptExtraction } from '@/services/ai/prompts';
import type { AiResult, SimpleChatMessage } from '@/types/ai';
import { parseJsonResponse } from './shared';

// Update as newer Gemini models become available.
const MODEL = 'gemini-3.6-flash';

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
type Content = { role: 'user' | 'model'; parts: Part[] };

async function callGenerate(
  systemPrompt: string,
  contents: Content[],
  apiKey: string
): Promise<AiResult<any>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
      }),
    });
    if (res.status === 400 || res.status === 403) return { ok: false, error: { type: 'invalid_key' } };
    if (res.status === 429) return { ok: false, error: { type: 'rate_limited' } };
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: { type: 'unknown', message: text || `Request failed (${res.status}).` } };
    }
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, error: { type: 'network', message: 'Could not reach the Gemini API.' } };
  }
}

function extractText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p: any) => p.text ?? '')
    .join('\n')
    .trim();
}

export async function sendChatMessage(
  systemPrompt: string,
  history: SimpleChatMessage[],
  apiKey: string
): Promise<AiResult<string>> {
  const contents: Content[] = history.map((h) => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.text }],
  }));
  const result = await callGenerate(systemPrompt, contents, apiKey);
  if (!result.ok) return result;
  return { ok: true, data: extractText(result.data) };
}

export async function extractReceiptFromImage(
  base64: string,
  mimeType: string,
  apiKey: string
): Promise<AiResult<ReceiptExtraction>> {
  const contents: Content[] = [
    {
      role: 'user',
      parts: [
        { text: 'Extract the expense details from this receipt photo.' },
        { inlineData: { mimeType, data: base64 } },
      ],
    },
  ];
  const result = await callGenerate(buildReceiptExtractionPrompt(), contents, apiKey);
  if (!result.ok) return result;
  return parseJsonResponse<ReceiptExtraction>(extractText(result.data));
}
