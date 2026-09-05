import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { uid } from '@/utils/id';

// Structurally identical to services/receipts/capture.ts — same
// expo-image-picker camera flow, no expo-camera dependency needed.

export type CapturedProductPhoto = {
  uri: string;
  base64: string | null;
  mimeType: string;
};

function scannerDirectory(): Directory {
  const dir = new Directory(Paths.document, 'scanner');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

async function persistPickedAsset(asset: ImagePicker.ImagePickerAsset): Promise<CapturedProductPhoto> {
  const ext = asset.mimeType?.includes('png') ? 'png' : 'jpg';
  const source = new File(asset.uri);
  const dest = new File(scannerDirectory(), `${uid()}.${ext}`);
  await source.copy(dest);
  return {
    uri: dest.uri,
    base64: asset.base64 ?? null,
    mimeType: asset.mimeType ?? (ext === 'png' ? 'image/png' : 'image/jpeg'),
  };
}

export async function captureProductPhoto(): Promise<CapturedProductPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.6,
    base64: true,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return persistPickedAsset(result.assets[0]);
}

export async function pickProductPhotoFromLibrary(): Promise<CapturedProductPhoto | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.6,
    base64: true,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return persistPickedAsset(result.assets[0]);
}

export async function deleteProductPhoto(uri: string): Promise<void> {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // best-effort cleanup
  }
}
