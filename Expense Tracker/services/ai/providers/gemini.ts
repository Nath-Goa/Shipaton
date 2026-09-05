import { DEFAULT_AI_MODEL } from '@/constants/aiModels';
import {
  buildCompanyIdentificationPrompt,
  buildReceiptExtractionPrompt,
  type CompanyIdentification,
  type ReceiptExtraction,
} from '@/services/ai/prompts';
import type { AiResult, SimpleChatMessage } from '@/types/ai';
import { parseJsonResponse } from './shared';

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
type Content = { role: 'user' | 'model'; parts: Part[] };

// Gemini returns HTTP 400 for a bad/missing API key *and* for a long list of
// unrelated request problems (bad model name, malformed content, disabled
// API, quota issues that aren't 429, etc.) — the status field alone doesn't
// tell them apart. A blanket "400/403 = invalid_key" mislabels those other
// failures as a key problem, so instead inspect the error body and only
// classify as invalid_key when it actually says so.
function isKeyError(status: number, body: any): boolean {
  const reason: string = body?.error?.details?.find((d: any) => d.reason)?.reason ?? '';
  if (reason === 'API_KEY_INVALID') return true;
  const message: string = (body?.error?.message ?? '').toLowerCase();
  if (message.includes('api key')) {
    return /invalid|not valid|expired|missing|malformed/.test(message);
  }
  // A bare 403 with no explanatory message is almost always a rejected key
  // (disabled/restricted key) rather than any other kind of request error.
  return status === 403 && !message;
}

async function callGenerate(
  systemPrompt: string,
  contents: Content[],
  apiKey: string,
  model?: string
): Promise<AiResult<any>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || DEFAULT_AI_MODEL.gemini}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
      }),
    });
    if (res.status === 429) return { ok: false, error: { type: 'rate_limited' } };
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const body = (() => {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      })();
      if ((res.status === 400 || res.status === 403) && isKeyError(res.status, body)) {
        return { ok: false, error: { type: 'invalid_key' } };
      }
      const message = body?.error?.message || text || `Request failed (${res.status}).`;
      return { ok: false, error: { type: 'unknown', message } };
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
  apiKey: string,
  model?: string
): Promise<AiResult<string>> {
  const contents: Content[] = history.map((h) => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.text }],
  }));
  const result = await callGenerate(systemPrompt, contents, apiKey, model);
  if (!result.ok) return result;
  return { ok: true, data: extractText(result.data) };
}

export async function extractReceiptFromImage(
  base64: string,
  mimeType: string,
  apiKey: string,
  model?: string
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
  const result = await callGenerate(buildReceiptExtractionPrompt(), contents, apiKey, model);
  if (!result.ok) return result;
  return parseJsonResponse<ReceiptExtraction>(extractText(result.data));
}

export async function identifyCompanyFromImage(
  base64: string,
  mimeType: string,
  apiKey: string,
  model?: string
): Promise<AiResult<CompanyIdentification>> {
  const contents: Content[] = [
    {
      role: 'user',
      parts: [
        { text: 'Which company or brand made this product?' },
        { inlineData: { mimeType, data: base64 } },
      ],
    },
  ];
  const result = await callGenerate(buildCompanyIdentificationPrompt(), contents, apiKey, model);
  if (!result.ok) return result;
  return parseJsonResponse<CompanyIdentification>(extractText(result.data));
}
