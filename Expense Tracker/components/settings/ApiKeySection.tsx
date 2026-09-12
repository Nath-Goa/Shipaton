import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Text } from '@/components/ui/Text';
import { DEFAULT_AI_MODEL } from '@/constants/aiModels';
import { radius, spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useHasApiKey } from '@/hooks/useHasApiKey';
import { useTheme } from '@/hooks/useTheme';
import { clearApiKey, getApiKey, maskKey, setApiKey } from '@/services/ai/apiKey';
import { hasSharedFallback } from '@/services/ai/client';
import { useSettingsStore } from '@/store/useSettingsStore';
import { AI_PROVIDER_LABELS, type AiProvider } from '@/types/ai';

const PROVIDER_OPTIONS: { value: AiProvider; label: string }[] = [
  { value: 'claude', label: 'Claude' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Gemini' },
];

type Props = {
  onSaved?: () => void;
  showHint?: boolean;
};

export function ApiKeySection({ onSaved, showHint = true }: Props) {
  const { colors } = useTheme();
  const { aiProvider, setAiProvider, customModelByProvider, setCustomModel } = useSettingsStore();
  const keyBroken = useSettingsStore((s) => !!s.brokenKeyProviders[aiProvider]);
  const { hasKey, refresh } = useHasApiKey();
  const [keyInput, setKeyInput] = useState('');
  const [savedMask, setSavedMask] = useState<string | null>(null);
  const [modelInput, setModelInput] = useState('');

  useEffect(() => {
    setModelInput(customModelByProvider[aiProvider] ?? '');
  }, [aiProvider, customModelByProvider]);

  useEffect(() => {
    let alive = true;
    getApiKey(aiProvider).then((key) => {
      if (alive) setSavedMask(key ? maskKey(key) : null);
    });
    setKeyInput('');
    return () => {
      alive = false;
    };
  }, [aiProvider]);

  async function saveKey() {
    if (!keyInput.trim()) return;
    await setApiKey(aiProvider, keyInput);
    setSavedMask(maskKey(keyInput.trim()));
    setKeyInput('');
    refresh();
    onSaved?.();
  }

  async function removeKey() {
    await clearApiKey(aiProvider);
    setSavedMask(null);
    refresh();
  }

  return (
    <View style={{ gap: spacing.md }}>
      <SegmentedControl options={PROVIDER_OPTIONS} value={aiProvider} onChange={setAiProvider} />
      <Card>
        {savedMask ? (
          <>
            <View style={styles.keyRow}>
              <View>
                <Text style={[styles.label, { color: colors.text3 }]}>{AI_PROVIDER_LABELS[aiProvider]} key</Text>
                <Text style={[styles.maskedKey, { color: colors.text }]}>{savedMask}</Text>
              </View>
              <Button label="Remove" variant="ghost" onPress={removeKey} />
            </View>
            <View style={styles.modelRow}>
              <Text style={[styles.label, { color: colors.text3 }]}>Model (optional)</Text>
              <TextInput
                value={modelInput}
                onChangeText={setModelInput}
                onEndEditing={() => setCustomModel(aiProvider, modelInput)}
                placeholder={DEFAULT_AI_MODEL[aiProvider]}
                placeholderTextColor={colors.text3}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
              />
              <Text style={[styles.modelHint, { color: colors.text3 }]}>
                Leave blank to use the default ({DEFAULT_AI_MODEL[aiProvider]}).
              </Text>
            </View>
            {keyBroken ? (
              <Text style={[styles.brokenHint, { color: colors.warning }]}>
                This key isn't working right now — AI features are using the built-in key instead.
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={[styles.label, { color: colors.text3 }]}>{AI_PROVIDER_LABELS[aiProvider]} API key</Text>
            <TextInput
              value={keyInput}
              onChangeText={setKeyInput}
              placeholder="Paste your API key"
              placeholderTextColor={colors.text3}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
            />
            <View style={{ marginTop: spacing.md }}>
              <Button label="Save key" onPress={saveKey} disabled={!keyInput.trim()} />
            </View>
          </>
        )}
      </Card>
      {showHint && hasKey === false ? (
        <Text style={[styles.hint, { color: colors.text3 }]}>
          {hasSharedFallback()
            ? 'Without a key, the Assistant and receipt auto-fill still work off a shared free key — add your own for faster, better responses.'
            : 'Without a key, mock trading and expenses still work — only the Assistant and receipt auto-fill need one.'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    marginTop: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 14,
    letterSpacing: trackingFor(14),
  },
  keyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  maskedKey: { fontSize: 14, letterSpacing: trackingFor(14), fontWeight: '600', marginTop: 4 },
  modelRow: { marginTop: spacing.lg },
  modelHint: { fontSize: 11.5, letterSpacing: trackingFor(11.5), lineHeight: 15, marginTop: spacing.sm },
  brokenHint: { fontSize: 11.5, letterSpacing: trackingFor(11.5), lineHeight: 15, marginTop: spacing.md },
  hint: { fontSize: 12, letterSpacing: trackingFor(12), lineHeight: 16 },
});
