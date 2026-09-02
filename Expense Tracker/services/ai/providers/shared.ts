import type { AiResult } from '@/types/ai';

export function parseJsonResponse<T>(text: string): AiResult<T> {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text) as T;
    return { ok: true, data: parsed };
  } catch {
    return {
      ok: false,
      error: { type: 'unknown', message: "Couldn't parse the AI's response — try again." },
    };
  }
}
