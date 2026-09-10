import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import { CompanyResultSheet, type ScannerCandidate } from '@/components/scanner/CompanyResultSheet';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { TIER_FEATURES } from '@/constants/subscription';
import { TICKERS } from '@/constants/tickers';
import { useAgePermissions } from '@/hooks/useAgePermissions';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { identifyCompanyFromImage } from '@/services/ai/client';
import { describeAiError } from '@/services/ai/errorMessage';
import {
  captureProductPhoto,
  pickProductPhotoFromLibrary,
  type CapturedProductPhoto,
} from '@/services/scanner/capture';
import { cleanupProductPhotoCache, deleteProductPhoto } from '@/services/images/storedImageFiles';
import { useSettingsStore } from '@/store/useSettingsStore';

// A single-screen modal route (no nested _layout — see settings/upgrade.tsx
// for the same pattern): the parent Stack.Screen in app/_layout.tsx supplies
// the native "Scan a product" header and its own back/close chevron, so
// this screen never needs its own TopBar.

// Resolves an AI-guessed company name against the app's own tracked tickers
// (a loose, case-insensitive substring match — "Apple" should match "Apple
// Inc.") so a real guess can deep-link straight to that stock's detail page;
// an untracked guess is still shown, just without a "View stock" action.
function resolveTicker(name: string): string | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  const match = TICKERS.find((t) => t.name.toLowerCase().includes(needle) || needle.includes(t.name.toLowerCase()));
  return match?.symbol ?? null;
}

export default function ScannerScreen() {
  const { colors } = useTheme();
  const tier = useSettingsStore((s) => s.tier);
  const features = TIER_FEATURES[tier];
  const agePermissions = useAgePermissions();
  const upgradeToTier = useUpgradeToTier();

  const [photo, setPhoto] = useState<CapturedProductPhoto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ScannerCandidate[] | null>(null);
  const photoRef = useRef<CapturedProductPhoto | null>(null);

  useEffect(() => {
    cleanupProductPhotoCache();
    return () => {
      if (photoRef.current?.uri) deleteProductPhoto(photoRef.current.uri);
    };
  }, []);

  async function runScan(captured: CapturedProductPhoto | null) {
    if (!captured) return;
    if (!captured.base64) {
      deleteProductPhoto(captured.uri);
      return;
    }
    if (photoRef.current?.uri && photoRef.current.uri !== captured.uri) deleteProductPhoto(photoRef.current.uri);
    photoRef.current = captured;
    setPhoto(captured);
    setCandidates(null);
    setError(null);
    setLoading(true);
    const result = await identifyCompanyFromImage(captured.base64, captured.mimeType);
    setLoading(false);
    if (!result.ok) {
      setError(describeAiError(result.error));
      return;
    }
    setCandidates(
      result.data.candidates.map((c) => ({
        name: c.name,
        confidence: c.confidence,
        reason: c.reason,
        symbol: resolveTicker(c.name),
      }))
    );
  }

  function reset() {
    if (photoRef.current?.uri) deleteProductPhoto(photoRef.current.uri);
    photoRef.current = null;
    setPhoto(null);
    setCandidates(null);
    setError(null);
  }

  // Checked ahead of the tier gate: an upgrade prompt would be the wrong
  // answer here, since paying does not lift this one. The AI client refuses
  // the call anyway (services/ai/client.ts), this just stops a minor being
  // walked all the way to the camera before finding that out.
  if (!agePermissions.aiPhotoUpload) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <EmptyState
          icon="🔒"
          title="Photo scanning is off for under-18s"
          message="Scanning works by sending your photo to an outside AI company, so Markva keeps it switched off for under-18 accounts. You can still look up any company by name from the Markets tab."
        />
      </Screen>
    );
  }

  if (!features.productScanner) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <EmptyState
          icon="🔒"
          title="Product scanner is a Pro feature"
          message="Point your camera at any product and find the company behind it — with a direct link to its stock."
          actionLabel="Upgrade to Pro"
          onAction={() => upgradeToTier('pro')}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      {!photo ? (
        <View style={styles.startWrap}>
          <View style={[styles.iconCircle, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="camera-outline" size={32} color={colors.accent} />
          </View>
          <Text style={[styles.startTitle, { color: colors.text }]}>Scan a product</Text>
          <Text style={[styles.startBody, { color: colors.text2 }]}>
            Take a photo of a logo, package, or device and the AI will guess which public company makes it — tap
            through to research its stock.
          </Text>
          <View style={styles.startActions}>
            <Button label="Take a photo" onPress={() => captureProductPhoto().then(runScan)} />
            <Button label="Choose from library" variant="ghost" onPress={() => pickProductPhotoFromLibrary().then(runScan)} />
          </View>
        </View>
      ) : (
        <View style={styles.previewWrap}>
          <Image source={{ uri: photo.uri }} style={[styles.previewImage, { backgroundColor: colors.surface2 }]} />
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
              <Text style={[styles.loadingText, { color: colors.text2 }]}>Identifying the company…</Text>
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
              <Button label="Try again" variant="ghost" onPress={reset} />
            </View>
          ) : null}
        </View>
      )}

      {candidates ? (
        <CompanyResultSheet photoUri={photo!.uri} candidates={candidates} onDismiss={reset} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  startWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  iconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  startTitle: { fontSize: 20, fontWeight: '700' },
  startBody: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  startActions: { width: '100%', gap: spacing.sm, marginTop: spacing.lg },
  previewWrap: { flex: 1 },
  previewImage: { width: '100%', height: 260 },
  center: { alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xxl, gap: spacing.md, paddingHorizontal: spacing.xl },
  loadingText: { fontSize: 13.5 },
  errorText: { fontSize: 13.5, textAlign: 'center' },
});
