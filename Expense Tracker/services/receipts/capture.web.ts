import * as ImagePicker from 'expo-image-picker';

export type CapturedReceipt = {
  uri: string;
  base64: string | null;
  mimeType: string;
};

function fromAsset(asset: ImagePicker.ImagePickerAsset): CapturedReceipt {
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const base64 = asset.base64 ?? null;
  return {
    // A data URL survives AsyncStorage/reloads; the browser's temporary blob
    // URL does not. ImagePicker already applies the requested quality.
    uri: base64 ? `data:${mimeType};base64,${base64}` : asset.uri,
    base64,
    mimeType,
  };
}

async function pick(): Promise<CapturedReceipt | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.65,
    allowsEditing: true,
    base64: true,
  });
  return result.canceled || !result.assets?.[0] ? null : fromAsset(result.assets[0]);
}

// Browsers do not expose a dependable native camera flow through Expo's
// picker. Opening the picker still allows camera capture on browsers/devices
// that offer it and remains functional on desktop localhost.
export const captureReceiptFromCamera = pick;
export const pickReceiptFromLibrary = pick;
