import { hasSharedFallback } from '@/services/ai/client';
import type { AiError } from '@/types/ai';

// One shared mapping from an AiError to what the user sees, used by every
// AI-consuming screen (Assistant chat, quizzes, daily challenges, pattern
// detection, receipt auto-fill, spending insights) so the wording stays
// consistent everywhere instead of being duplicated per screen.
export function describeAiError(error: AiError): string {
  switch (error.type) {
    case 'missing_key':
      return hasSharedFallback()
        ? 'AI features are temporarily unavailable — try again shortly, or add your own API key in Settings.'
        : 'Add your API key in Settings to use this.';
    case 'invalid_key':
      return "That API key was rejected — check it in Settings. We've switched you to the built-in key for now.";
    case 'rate_limited':
      return "The built-in key is in high demand right now. Add your own API key for guaranteed access, or upgrade for a bigger daily allowance.";
    case 'network':
      return "Couldn't reach the AI provider. Check your connection.";
    case 'quota_exceeded':
      return "You've used today's free AI actions for your plan. Add your own API key for unlimited use, or upgrade for more.";
    case 'age_restricted':
      // Always set at the point of refusal in services/ai/client.ts, which
      // knows which rule was hit; the fallback is only here for exhaustiveness.
      return error.message || 'This feature is not available on your account.';
    default:
      return error.message || 'Something went wrong.';
  }
}

// Which extra actions to offer alongside the error message — a rate limit
// or quota exhaustion on the shared key are exactly the moments where
// "add your own key" or "upgrade for a bigger allowance" are the two real
// ways out, so both a screen's primary and secondary action button should
// be shown for these.
export function aiErrorActions(error: AiError): { showAddKey: boolean; showUpgrade: boolean } {
  switch (error.type) {
    case 'rate_limited':
    case 'quota_exceeded':
      return { showAddKey: true, showUpgrade: true };
    case 'missing_key':
    case 'invalid_key':
      return { showAddKey: true, showUpgrade: false };
    default:
      return { showAddKey: false, showUpgrade: false };
  }
}

// Kept for callers that only care about the upgrade case specifically.
export function aiErrorNeedsUpgrade(error: AiError): boolean {
  return aiErrorActions(error).showUpgrade;
}
