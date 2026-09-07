import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';

const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.65;

export async function prepareCapturedImage(asset: ImagePickerAsset): Promise<{
  file: File;
  base64: string | null;
  mimeType: string;
}> {
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > MAX_IMAGE_EDGE) {
    if (asset.width >= asset.height) context.resize({ width: MAX_IMAGE_EDGE, height: null });
    else context.resize({ width: null, height: MAX_IMAGE_EDGE });
  }

  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    base64: true,
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
  });

  return { file: new File(result.uri), base64: result.base64 ?? null, mimeType: 'image/jpeg' };
}
