import { getApiKey } from '@/services/ai/apiKey';
import type { ReceiptExtraction } from '@/services/ai/prompts';
import * as claude from '@/services/ai/providers/claude';
import * as gemini from '@/services/ai/providers/gemini';
import * as openai from '@/services/ai/providers/openai';
import { parseJsonResponse } from '@/services/ai/providers/shared';
import { useAiUsageStore } from '@/store/useAiUsageStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { AiProvider, AiResult, SimpleChatMessage } from '@/types/ai';

// Dispatches to whichever provider the user picked in Settings, using their
// own key for that provider when they have one — every AI feature in the
// app (chat, quizzes, daily challenges, pattern detection, receipt
// auto-fill, spending insights) goes through this file, never a provider
// file directly, so the key/model/quota/fallback logic below only has to
// live in one place.

type ProviderClient = {
  sendChatMessage: (
    systemPrompt: string,
    history: SimpleChatMessage[],
    apiKey: string,
    model?: string
  ) => Promise<AiResult<string>>;
  extractReceiptFromImage: (
    base64: string,
    mimeType: string,
    apiKey: string,
    model?: string
  ) => Promise<AiResult<ReceiptExtraction>>;
};

function clientFor(provider: AiProvider): ProviderClient {
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
// provider regardless of which provider the user has selected, and why it's
// always run on its default model (see withResolvedKey) rather than any
// per-device override — this key's behavior/cost needs to stay predictable
// since every install on it shares the same rate limit.
const FALLBACK_PROVIDER: AiProvider = 'gemini';
// Trimmed defensively — a value pasted into the EAS dashboard from a phone
// keyboard can pick up a stray leading/trailing space or newline, which
// would otherwise make this a non-empty-but-invalid key instead of a clean
// missing/present check.
const FALLBACK_API_KEY = process.env.EXPO_PUBLIC_SHARED_GEMINI_API_KEY?.trim() || undefined;

export function hasSharedFallback(): boolean {
  return !!FALLBACK_API_KEY;
}

// Central key/model/quota resolution, shared by every public function below.
// `call` invokes whichever method (sendChatMessage / extractReceiptFromImage)
// the caller needs against a resolved provider client.
//
// Order of operations:
// 1. A personal key, if saved, is tried first and is UNLIMITED — no quota
//    check. `applyCustomModel` gates whether the user's per-provider model
//    override (Settings > AI provider > Model) applies: true only for real
//    Assistant chat, false for quizzes/challenges/pattern detection/receipt
//    auto-fill/insights, which always run the provider's predefined default
//    model (see constants/aiModels.ts) regardless of that override.
// 2. If the personal key fails with invalid_key specifically (the key
//    itself is broken/revoked — not a transient rate limit or network
//    blip), it's marked broken (a small, non-blocking UI notice reads this
//    from useSettingsStore) and this function falls through to the shared
//    key below rather than surfacing the error — any other error type is
//    returned as-is, since retrying those against a different key wouldn't
//    reflect what actually went wrong.
// 3. The shared key is checked against the unified daily quota
//    (AI_FEATURE_DAILY_LIMIT[tier], see constants/subscription.ts) before
//    every call, and always runs the fallback provider's default model.
//    Usage is recorded only on a successful call.
async function withResolvedKey<T>(
  call: (client: ProviderClient, apiKey: string, model: string | undefined) => Promise<AiResult<T>>,
  opts: { applyCustomModel: boolean }
): Promise<AiResult<T>> {
  const settings = useSettingsStore.getState();
  const provider = settings.aiProvider;
  const personalKey = await getApiKey(provider);

  if (personalKey) {
    const model = opts.applyCustomModel ? settings.customModelByProvider[provider] || undefined : undefined;
    const result = await call(clientFor(provider), personalKey, model);
    if (result.ok) {
      if (settings.brokenKeyProviders[provider]) useSettingsStore.getState().clearKeyBroken(provider);
      return result;
    }
    if (result.error.type !== 'invalid_key') return result;
    useSettingsStore.getState().markKeyBroken(provider);
    // fall through to the shared key below
  }

  if (!FALLBACK_API_KEY) return { ok: false, error: { type: 'missing_key' } };

  const tier = useSettingsStore.getState().tier;
  if (useAiUsageStore.getState().remainingToday(tier) <= 0) {
    return { ok: false, error: { type: 'quota_exceeded' } };
  }

  const result = await call(clientFor(FALLBACK_PROVIDER), FALLBACK_API_KEY, undefined);
  if (result.ok) useAiUsageStore.getState().recordUsage();
  return result;
}

// The Assistant's direct chat entry point — the only caller that gets a
// user's custom model override applied.
export async function sendChatMessage(
  systemPrompt: string,
  history: SimpleChatMessage[]
): Promise<AiResult<string>> {
  return withResolvedKey<string>(
    (client, apiKey, model) => client.sendChatMessage(systemPrompt, history, apiKey, model),
    { applyCustomModel: true }
  );
}

export async function extractReceiptFromImage(base64: string, mimeType: string): Promise<AiResult<ReceiptExtraction>> {
  return withResolvedKey<ReceiptExtraction>(
    (client, apiKey, model) => client.extractReceiptFromImage(base64, mimeType, apiKey, model),
    { applyCustomModel: false }
  );
}

// Single-turn "ask for JSON matching this shape" helper, reused by quiz
// generation, pattern detection, narrative scenarios, and spending
// insights — anywhere we want a structured object back instead of
// free-form chat text. Always runs the default model, never a user's chat
// override (see withResolvedKey).
export async function sendStructuredPrompt<T>(systemPrompt: string, userPrompt: string): Promise<AiResult<T>> {
  const result = await withResolvedKey<string>(
    (client, apiKey, model) => client.sendChatMessage(systemPrompt, [{ role: 'user', text: userPrompt }], apiKey, model),
    { applyCustomModel: false }
  );
  if (!result.ok) return result;
  return parseJsonResponse<T>(result.data);
}
