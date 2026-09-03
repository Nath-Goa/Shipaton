import { hasSharedFallback } from '@/services/ai/client';
import type { AiError } from '@/types/ai';

// One shared mapping from an AiError to what the user sees, used by every
// AI-consuming screen (Assistant chat, quizzes, daily challenges, pattern
// detection, receipt auto-fill, spending insights) so the wording — and the
// quota_exceeded case in particular — stays consistent everywhere instead
// of being duplicated per screen.
export function describeAiError(error: AiError): string {
  switch (error.type) {
    case 'missing_key':
      return hasSharedFallback()
        ? 'AI features are temporarily unavailable — try again shortly, or add your own API key in Settings.'
        : 'Add your API key in Settings to use this.';
    case 'invalid_key':
      return "That API key was rejected — check it in Settings. We've switched you to the built-in key for now.";
    case 'rate_limited':
      return 'Rate limited by the provider — try again in a moment.';
    case 'network':
      return "Couldn't reach the AI provider. Check your connection.";
    case 'quota_exceeded':
      return "You've used today's free AI actions for your plan. Upgrade for more, or add your own API key for unlimited use.";
    default:
      return error.message || 'Something went wrong.';
  }
}

// Whether the given error should route an action button to the Upgrade
// screen instead of Settings — the two other "add/fix a key" cases (missing
// or invalid) still point at Settings.
export function aiErrorNeedsUpgrade(error: AiError): boolean {
  return error.type === 'quota_exceeded';
}
