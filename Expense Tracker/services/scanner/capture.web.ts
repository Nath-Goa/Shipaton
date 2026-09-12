import * as ImagePicker from 'expo-image-picker';

export type CapturedProductPhoto = {
  uri: string;
  base64: string | null;
  mimeType: string;
};

async function pick(): Promise<CapturedProductPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.65,
    allowsEditing: false,
    base64: true,
  });
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const base64 = asset.base64 ?? null;
  return {
    uri: base64 ? `data:${mimeType};base64,${base64}` : asset.uri,
    base64,
    mimeType,
  };
}

export const captureProductPhoto = pick;
export const pickProductPhotoFromLibrary = pick;
