import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { uid } from '@/utils/id';
import { prepareCapturedImage } from '@/services/images/prepareCapturedImage';

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
  const prepared = await prepareCapturedImage(asset);
  const dest = new File(receiptsDirectory(), `${uid()}.jpg`);
  await prepared.file.copy(dest);
  prepared.file.delete();
  return {
    uri: dest.uri,
    base64: prepared.base64,
    mimeType: prepared.mimeType,
  };
}

export async function captureReceiptFromCamera(): Promise<CapturedReceipt | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.8,
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
    quality: 0.8,
    allowsEditing: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return persistPickedAsset(result.assets[0]);
}
