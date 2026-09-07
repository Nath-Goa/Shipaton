import { Directory, File, Paths } from 'expo-file-system';

function deleteFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // best-effort cleanup
  }
}

export const deleteReceiptFile = deleteFile;
export const deleteProductPhoto = deleteFile;

export function cleanupUnreferencedReceiptFiles(referencedUris: ReadonlySet<string>): void {
  try {
    const directory = new Directory(Paths.document, 'receipts');
    if (!directory.exists) return;
    for (const entry of directory.list()) {
      if (entry instanceof File && !referencedUris.has(entry.uri)) entry.delete();
    }
  } catch {
    // best-effort cleanup
  }
}

export function cleanupProductPhotoCache(): void {
  try {
    const directory = new Directory(Paths.document, 'scanner');
    if (!directory.exists) return;
    for (const entry of directory.list()) entry.delete();
  } catch {
    // best-effort cleanup
  }
}
