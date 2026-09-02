import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ChatBubble } from '@/components/chat/ChatBubble';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { TopBar } from '@/components/ui/TopBar';
import { badgeInfo } from '@/constants/badges';
import { spacing } from '@/constants/theme';
import { TIER_FEATURES, TIER_LABELS } from '@/constants/subscription';
import { tickerOf } from '@/constants/tickers';
import { useHasApiKey } from '@/hooks/useHasApiKey';
import { useTheme } from '@/hooks/useTheme';
import { hasSharedFallback, sendChatMessage } from '@/services/ai/client';
import { buildAnalystSystemPrompt } from '@/services/ai/prompts';
import { useChatStore } from '@/store/useChatStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useStreakStore } from '@/store/useStreakStore';
import { useToastStore } from '@/store/useToastStore';
import type { AiError } from '@/types/ai';
import type { ChatMessage, ThreadKey } from '@/types/chat';
import { uid } from '@/utils/id';

function errorMessage(error: AiError): string {
  switch (error.type) {
    case 'missing_key':
      return 'Add your API key in Settings to start chatting.';
    case 'invalid_key':
      return 'That API key was rejected. Check it in Settings.';
    case 'rate_limited':
      return 'Rate limited by the provider — try again in a moment.';
    case 'network':
      return "Couldn't reach the API. Check your connection.";
    default:
      return error.message || 'Something went wrong.';
  }
}

export default function AssistantScreen() {
  const { symbol: paramSymbol } = useLocalSearchParams<{ symbol?: string }>();
  const { colors } = useTheme();
  const tier = useSettingsStore((s) => s.tier);
  const features = TIER_FEATURES[tier];
  const { hasKey } = useHasApiKey();
  const { threads, addMessage, remainingToday, recordUsage } = useChatStore();
  const recordAnalystQuestion = useStreakStore((s) => s.recordAnalystQuestion);
  const showToast = useToastStore((s) => s.show);

  const [activeThread, setActiveThread] = useState<ThreadKey>('general');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (paramSymbol) setActiveThread(paramSymbol.toUpperCase());
  }, [paramSymbol]);

  const threadKeys = useMemo(() => {
    const keys = new Set<ThreadKey>(['general', ...Object.keys(threads)]);
    if (paramSymbol) keys.add(paramSymbol.toUpperCase());
    return Array.from(keys);
  }, [threads, paramSymbol]);

  const messages = threads[activeThread] ?? [];
  const remaining = remainingToday(features.assistantDailyLimit);
  const quotaExhausted = remaining !== null && remaining <= 0;

  async function handleSend(text: string) {
    const userMessage: ChatMessage = { id: uid(), role: 'user', text, createdAt: Date.now() };
    addMessage(activeThread, userMessage);
    setLoading(true);

    const context = activeThread !== 'general' ? { symbol: activeThread, name: tickerOf(activeThread)?.name ?? activeThread } : undefined;
    const systemPrompt = buildAnalystSystemPrompt(context);
    const history = [...messages, userMessage].map((m) => ({ role: m.role, text: m.text }));

    const result = await sendChatMessage(systemPrompt, history);
    setLoading(false);

    if (result.ok) {
      addMessage(activeThread, { id: uid(), role: 'assistant', text: result.data, createdAt: Date.now() });
      recordUsage();
      const earned = recordAnalystQuestion();
      if (earned.length) showToast(`${badgeInfo(earned[0]).icon} Badge earned: ${badgeInfo(earned[0]).label}`);
    } else {
      addMessage(activeThread, {
        id: uid(),
        role: 'assistant',
        text: errorMessage(result.error),
        createdAt: Date.now(),
        isError: true,
      });
    }
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }

  return (
    <Screen>
      <TopBar title="Assistant" subtitle="Ask the analyst — educational, not financial advice" />

      {threadKeys.length > 1 ? (
        <Animated.View entering={FadeInDown.duration(250).springify().damping(16)}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.threadRow}>
            {threadKeys.map((key) => (
              <Chip
                key={key}
                label={key === 'general' ? 'General' : key}
                active={activeThread === key}
                onPress={() => setActiveThread(key)}
              />
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {messages.length === 0 ? (
            <EmptyState
              icon="🤖"
              title={activeThread === 'general' ? 'Ask anything about investing' : `Ask about ${activeThread}`}
              message="Explains terms in plain English, scoped to this simulated app — not real market data."
            />
          ) : (
            messages.map((m) => <ChatBubble key={m.id} message={m} />)
          )}
          {loading ? <TypingIndicator /> : null}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          {hasKey === false && !hasSharedFallback() ? (
            <View style={styles.gate}>
              <Text style={[styles.gateText, { color: colors.text3 }]}>Add your API key in Settings to start chatting.</Text>
              <Button label="Open Settings" variant="ghost" onPress={() => router.push('/settings')} />
            </View>
          ) : quotaExhausted ? (
            <View style={styles.gate}>
              <Text style={[styles.gateText, { color: colors.text3 }]}>
                Daily limit reached on {TIER_LABELS[tier]}. Upgrade for unlimited messages.
              </Text>
              <Button label="Upgrade" onPress={() => router.push('/settings/upgrade')} />
            </View>
          ) : (
            <>
              {hasKey === false ? (
                <Text style={[styles.sharedHint, { color: colors.text3 }]}>
                  Using a shared free key — add your own in Settings for faster, better responses.
                </Text>
              ) : null}
              {remaining !== null ? (
                <Text style={[styles.quota, { color: colors.text3 }]}>{remaining} message{remaining === 1 ? '' : 's'} left today</Text>
              ) : null}
              <ChatComposer onSend={handleSend} loading={loading} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  threadRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  messages: { padding: spacing.xl, paddingTop: spacing.sm, flexGrow: 1, justifyContent: 'flex-end' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: 6 },
  gate: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  gateText: { fontSize: 12.5, textAlign: 'center' },
  sharedHint: { fontSize: 11, textAlign: 'center', paddingHorizontal: spacing.sm, paddingBottom: 2 },
  quota: { fontSize: 11.5, textAlign: 'right', paddingHorizontal: spacing.sm },
});
