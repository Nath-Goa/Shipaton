import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Alert, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CategoryPicker } from '@/components/expenses/CategoryPicker';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CATEGORIES, type CategoryId } from '@/constants/categories';
import { radius, spacing } from '@/constants/theme';
import { TIER_FEATURES } from '@/constants/subscription';
import { useHasApiKey } from '@/hooks/useHasApiKey';
import { useTheme } from '@/hooks/useTheme';
import { extractReceiptFromImage } from '@/services/ai/client';
import { captureReceiptFromCamera, pickReceiptFromLibrary } from '@/services/receipts/capture';
import { useSettingsStore } from '@/store/useSettingsStore';
import { formatShortDate, parseDateLocal, todayStr } from '@/utils/date';

export type ExpenseFormValues = {
  desc: string;
  amount: number;
  date: string;
  category: CategoryId;
  photoUri?: string;
};

type Props = {
  initial?: Partial<ExpenseFormValues>;
  submitLabel: string;
  onSubmit: (values: ExpenseFormValues) => void;
  onDelete?: () => void;
};

export function ExpenseForm({ initial, submitLabel, onSubmit, onDelete }: Props) {
  const { colors } = useTheme();
  const tier = useSettingsStore((s) => s.tier);
  const features = TIER_FEATURES[tier];
  const { hasKey } = useHasApiKey();

  const [desc, setDesc] = useState(initial?.desc ?? '');
  const [amountText, setAmountText] = useState(initial?.amount ? String(initial.amount) : '');
  const [date, setDate] = useState(initial?.date ?? todayStr());
  const [category, setCategory] = useState<CategoryId>(initial?.category ?? 'food');
  const [photoUri, setPhotoUri] = useState<string | undefined>(initial?.photoUri);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMime, setPhotoMime] = useState('image/jpeg');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAutoFill = features.receiptAutoFill && hasKey === true;

  async function handleCapture(source: 'camera' | 'library') {
    const result = source === 'camera' ? await captureReceiptFromCamera() : await pickReceiptFromLibrary();
    if (!result) return;
    setPhotoUri(result.uri);
    setPhotoBase64(result.base64);
    setPhotoMime(result.mimeType);
  }

  async function handleAutoFill() {
    if (!photoBase64) {
      Alert.alert('No photo data', 'Retake the photo to use auto-fill.');
      return;
    }
    setAutoFilling(true);
    setError(null);
    const result = await extractReceiptFromImage(photoBase64, photoMime);
    setAutoFilling(false);
    if (!result.ok) {
      const msg =
        result.error.type === 'missing_key'
          ? 'Add your API key in Settings first.'
          : result.error.type === 'invalid_key'
            ? 'That API key was rejected — check it in Settings.'
            : result.error.message || 'Could not read that receipt.';
      Alert.alert('Auto-fill failed', msg);
      return;
    }
    const data = result.data;
    if (data.description) setDesc(data.description);
    if (data.amount != null) setAmountText(String(data.amount));
    if (data.date) setDate(data.date);
    if (data.categoryGuess && CATEGORIES.some((c) => c.id === data.categoryGuess)) {
      setCategory(data.categoryGuess as CategoryId);
    }
  }

  function submit() {
    const amount = parseFloat(amountText);
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      setError('Enter an amount greater than $0.');
      return;
    }
    setError(null);
    onSubmit({ desc: desc.trim(), amount: Math.round(amount * 100) / 100, date, category, photoUri });
  }

  return (
    <View style={styles.wrap}>
      <Card>
        <Text style={[styles.label, { color: colors.text3 }]}>Receipt photo (optional)</Text>
        {photoUri ? (
          <View style={styles.photoRow}>
            <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            <View style={{ gap: spacing.sm, flex: 1 }}>
              {canAutoFill ? (
                <Button
                  label={autoFilling ? 'Reading receipt…' : 'Auto-fill with AI'}
                  variant="ghost"
                  loading={autoFilling}
                  onPress={handleAutoFill}
                />
              ) : null}
              <Button
                label="Remove photo"
                variant="ghost"
                onPress={() => {
                  setPhotoUri(undefined);
                  setPhotoBase64(null);
                }}
              />
            </View>
          </View>
        ) : (
          <View style={styles.photoButtons}>
            <Pressable style={[styles.photoBtn, { borderColor: colors.border }]} onPress={() => handleCapture('camera')}>
              <Ionicons name="camera-outline" size={20} color={colors.accent} />
              <Text style={[styles.photoBtnText, { color: colors.text2 }]}>Camera</Text>
            </Pressable>
            <Pressable style={[styles.photoBtn, { borderColor: colors.border }]} onPress={() => handleCapture('library')}>
              <Ionicons name="images-outline" size={20} color={colors.accent} />
              <Text style={[styles.photoBtnText, { color: colors.text2 }]}>Library</Text>
            </Pressable>
          </View>
        )}
      </Card>

      <Card style={{ gap: spacing.lg }}>
        <View>
          <Text style={[styles.label, { color: colors.text3 }]}>Description</Text>
          <TextInput
            value={desc}
            onChangeText={setDesc}
            placeholder="e.g. Lunch with the team"
            placeholderTextColor={colors.text3}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
          />
        </View>

        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.text3 }]}>Amount</Text>
            <TextInput
              value={amountText}
              onChangeText={setAmountText}
              placeholder="0.00"
              placeholderTextColor={colors.text3}
              keyboardType="decimal-pad"
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.text3 }]}>Date</Text>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={[styles.input, styles.dateInput, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
              <Text style={{ color: colors.text }}>{formatShortDate(date)}</Text>
            </Pressable>
          </View>
        </View>
        {showDatePicker ? (
          <DateTimePicker
            value={parseDateLocal(date)}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            maximumDate={new Date()}
            onChange={(event, selected) => {
              setShowDatePicker(Platform.OS === 'ios');
              if (event.type === 'dismissed') {
                setShowDatePicker(false);
                return;
              }
              if (selected) {
                const y = selected.getFullYear();
                const m = String(selected.getMonth() + 1).padStart(2, '0');
                const d = String(selected.getDate()).padStart(2, '0');
                setDate(`${y}-${m}-${d}`);
              }
              if (Platform.OS !== 'ios') setShowDatePicker(false);
            }}
          />
        ) : null}

        <View>
          <Text style={[styles.label, { color: colors.text3 }]}>Category</Text>
          <View style={{ marginTop: spacing.sm }}>
            <CategoryPicker value={category} onChange={setCategory} />
          </View>
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <Button label={submitLabel} fullWidth onPress={submit} />
        {onDelete ? <Button label="Delete expense" variant="ghost" fullWidth onPress={onDelete} /> : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  label: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    marginTop: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 14,
  },
  dateInput: { justifyContent: 'center' },
  row2: { flexDirection: 'row', gap: spacing.md },
  photoButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  photoBtn: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: 6,
  },
  photoBtnText: { fontSize: 12.5, fontWeight: '600' },
  photoRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  photoPreview: { width: 84, height: 84, borderRadius: radius.sm },
  error: { fontSize: 13, fontWeight: '600' },
});
