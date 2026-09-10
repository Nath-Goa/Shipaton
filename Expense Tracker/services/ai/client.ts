import { ageBandFor, permissionsFor } from '@/constants/ageCompliance';
import { getApiKey } from '@/services/ai/apiKey';
import type { CompanyIdentification, ReceiptExtraction } from '@/services/ai/prompts';
import * as claude from '@/services/ai/providers/claude';
import * as gemini from '@/services/ai/providers/gemini';
import * as openai from '@/services/ai/providers/openai';
import * as openrouter from '@/services/ai/providers/openrouter';
import { parseJsonResponse } from '@/services/ai/providers/shared';
import { useAgeStore } from '@/store/useAgeStore';
import { useAiUsageStore } from '@/store/useAiUsageStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { AiError, AiProvider, AiResult, SimpleChatMessage } from '@/types/ai';

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
  identifyCompanyFromImage: (
    base64: string,
    mimeType: string,
    apiKey: string,
    model?: string
  ) => Promise<AiResult<CompanyIdentification>>;
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

// Second, optional shared fallback (text-only) — when configured, every
// text-based AI feature races it against Gemini and uses whichever
// responds successfully first, so one provider having a slow/busy moment
// doesn't slow the user down. Always runs a live-verified free model (see
// openRouterModels.ts) — never the personal-key model override, and never
// used for receipt image extraction (free OpenRouter models are often
// text-only — that always goes straight to Gemini).
const OPENROUTER_API_KEY = process.env.EXPO_PUBLIC_SHARED_OPENROUTER_API_KEY?.trim() || undefined;

export function hasOpenRouterFallback(): boolean {
  return !!OPENROUTER_API_KEY;
}

// There's no backend/queue behind this app — every install talks directly
// to the AI provider, so a real cross-user "Max gets served before Free"
// priority queue isn't something a client-only app can implement. What IS
// feasible client-side: give higher tiers more automatic attempts when the
// shared key gets rate-limited (Gemini briefly saturated), so a Max user
// is meaningfully more likely to get through during a busy moment than a
// Free user, who gets none. This is an approximation, not real prioritization.
const SHARED_KEY_RETRIES: Record<'free' | 'pro' | 'max', number> = { free: 0, pro: 1, max: 3 };
const RETRY_BASE_DELAY_MS = 700;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resolves to the first successful result among `runners`; if every one
// fails, resolves to whichever failure settled last. Used to race Gemini
// against OpenRouter — both fire immediately, and whichever answers first
// (successfully) wins, so a slow/busy moment on one provider doesn't slow
// the user down. Both requests still run to completion in the background
// even after one wins; there's no cancellation, so racing does cost both
// providers' quota for that call, not just the winner's.
function raceFirstSuccess<T>(runners: Promise<AiResult<T>>[]): Promise<AiResult<T>> {
  return new Promise((resolve) => {
    let remaining = runners.length;
    let lastResult: AiResult<T>;
    for (const runner of runners) {
      runner.then((result) => {
        remaining--;
        lastResult = result;
        if (result.ok || remaining === 0) resolve(result.ok ? result : lastResult);
      });
    }
  });
}

async function callGeminiWithRetry<T>(
  call: (client: ProviderClient, apiKey: string, model: string | undefined) => Promise<AiResult<T>>,
  tier: 'free' | 'pro' | 'max'
): Promise<AiResult<T>> {
  const maxRetries = SHARED_KEY_RETRIES[tier];
  let attempt = 0;
  let result: AiResult<T>;
  for (;;) {
    result = await call(clientFor(FALLBACK_PROVIDER), FALLBACK_API_KEY!, undefined);
    if (result.ok || result.error.type !== 'rate_limited' || attempt >= maxRetries) return result;
    attempt++;
    await sleep(RETRY_BASE_DELAY_MS * attempt);
  }
}

// Age rules, applied by withResolvedKey before anything else so a blocked
// call never reaches a provider and never spends the shared key's quota.
// Every AI feature in the app funnels through that one function (see this
// file's header), which is what makes a single check here enough instead of
// one per screen — an AI feature added later inherits this without its
// author having to know it exists. See constants/ageCompliance.ts.
function ageRestriction(opts: { image?: boolean }): AiError | null {
  const { birthDate, aiDataConsent } = useAgeStore.getState();
  const permissions = permissionsFor(ageBandFor(birthDate));

  if (opts.image && !permissions.aiPhotoUpload) {
    return {
      type: 'age_restricted',
      message:
        'Photo scanning is off for under-18 accounts, so no picture of yours is sent to an AI provider. You can still enter the details by hand.',
    };
  }
  if (permissions.requiresAiConsent && aiDataConsent !== true) {
    return {
      type: 'age_restricted',
      message:
        'AI features are off for your account. Turn them on in Settings › Privacy & age if you want your questions sent to an AI provider.',
    };
  }
  return null;
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
// 3. The shared key(s) are checked against the unified daily quota
//    (AI_FEATURE_DAILY_LIMIT[tier], see constants/subscription.ts) before
//    every call. Gemini gets tier-based automatic retries on a rate limit
//    (see callGeminiWithRetry); if `raceEligible` and OpenRouter is
//    configured, both run concurrently and the first success wins.
//    Usage is recorded only on a successful call, once.
async function withResolvedKey<T>(
  call: (client: ProviderClient, apiKey: string, model: string | undefined) => Promise<AiResult<T>>,
  opts: { applyCustomModel: boolean; raceEligible?: boolean; image?: boolean }
): Promise<AiResult<T>> {
  const restricted = ageRestriction(opts);
  if (restricted) return { ok: false, error: restricted };

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

  const result =
    opts.raceEligible && OPENROUTER_API_KEY
      ? await raceFirstSuccess([
          callGeminiWithRetry(call, tier),
          call(openrouter, OPENROUTER_API_KEY, undefined),
        ])
      : await callGeminiWithRetry(call, tier);

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
    { applyCustomModel: true, raceEligible: true }
  );
}

// Never race-eligible: free OpenRouter models are frequently text-only, so
// image extraction always goes straight to Gemini (see openrouter.ts).
export async function extractReceiptFromImage(base64: string, mimeType: string): Promise<AiResult<ReceiptExtraction>> {
  return withResolvedKey<ReceiptExtraction>(
    (client, apiKey, model) => client.extractReceiptFromImage(base64, mimeType, apiKey, model),
    { applyCustomModel: false, image: true }
  );
}

// Product scanner (Pro/Max) — same never-race-eligible reasoning as receipt
// extraction above.
export async function identifyCompanyFromImage(base64: string, mimeType: string): Promise<AiResult<CompanyIdentification>> {
  return withResolvedKey<CompanyIdentification>(
    (client, apiKey, model) => client.identifyCompanyFromImage(base64, mimeType, apiKey, model),
    { applyCustomModel: false, image: true }
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
    { applyCustomModel: false, raceEligible: true }
  );
  if (!result.ok) return result;
  return parseJsonResponse<T>(result.data);
}
