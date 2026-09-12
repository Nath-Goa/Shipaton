// Browser image-picker results are blob/data URLs rather than app-owned
// filesystem entries. There is no Expo document directory to maintain on
// web, so cleanup is deliberately a no-op on this platform.
export function deleteReceiptFile(_uri: string): void {}

export function deleteProductPhoto(_uri: string): void {}

export function cleanupUnreferencedReceiptFiles(_referencedUris: ReadonlySet<string>): void {}

export function cleanupProductPhotoCache(): void {}
