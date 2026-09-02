import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { uid } from '@/utils/id';

export type CapturedReceipt = {
  uri: string; // stable, app-owned file:// uri
  base64: string | null;
  mimeType: string;
};

function receiptsDirectory(): Directory {
  const dir = new Directory(Paths.document, 'receipts');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

async function persistPickedAsset(asset: ImagePicker.ImagePickerAsset): Promise<CapturedReceipt> {
  const ext = asset.mimeType?.includes('png') ? 'png' : 'jpg';
  const source = new File(asset.uri);
  const dest = new File(receiptsDirectory(), `${uid()}.${ext}`);
  await source.copy(dest);
  return {
    uri: dest.uri,
    base64: asset.base64 ?? null,
    mimeType: asset.mimeType ?? (ext === 'png' ? 'image/png' : 'image/jpeg'),
  };
}

export async function captureReceiptFromCamera(): Promise<CapturedReceipt | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.6,
    base64: true,
    allowsEditing: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return persistPickedAsset(result.assets[0]);
}

export async function pickReceiptFromLibrary(): Promise<CapturedReceipt | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.6,
    base64: true,
    allowsEditing: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return persistPickedAsset(result.assets[0]);
}

export async function deleteReceiptFile(uri: string): Promise<void> {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // best-effort cleanup
  }
}
