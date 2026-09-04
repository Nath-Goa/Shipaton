import { FONT_FAMILY_BOLD, FONT_FAMILY_REGULAR } from '@/constants/fonts';
import { useSettingsStore } from '@/store/useSettingsStore';

export function useTypography() {
  const fontOption = useSettingsStore((s) => s.fontOption);
  const textScale = useSettingsStore((s) => s.textScale);
  return {
    fontOption,
    scale: textScale,
    regular: FONT_FAMILY_REGULAR[fontOption],
    bold: FONT_FAMILY_BOLD[fontOption],
  };
}
