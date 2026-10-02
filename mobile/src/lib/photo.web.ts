import type { ImagePickerAsset } from 'expo-image-picker';

/** Longest side, in pixels, of a photo we upload. Same values as photo.ts (native). */
export const PHOTO_MAX_EDGE = 1024;
/** JPEG quality of an uploaded photo (0..1). */
export const PHOTO_QUALITY = 0.7;

/**
 * Web version of shrinkPhoto: the browser's own canvas scaler is used instead of expo-image-manipulator's
 * JavaScript resampler, which blocks the page for seconds on a 12 MP photo on a cheap phone's browser.
 * Never throws: on any failure the original photo is returned.
 */
export async function shrinkPhoto(asset: ImagePickerAsset): Promise<ImagePickerAsset> {
  let bitmap: ImageBitmap | null = null;
  try {
    if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return asset;
    const source = await (await fetch(asset.uri)).blob();
    bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return asset;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // JPEG has no transparency: paint white first so transparent PNGs do not turn black.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY));
    if (!blob || blob.type !== 'image/jpeg') return asset;
    const base = (asset.fileName ?? 'photo').replace(/\.[^./\\]+$/, '');
    return {
      ...asset,
      uri: URL.createObjectURL(blob),
      width,
      height,
      mimeType: 'image/jpeg',
      fileName: `${base}.jpg`,
      fileSize: blob.size,
      file: undefined,
      base64: undefined,
      exif: undefined,
    };
  } catch {
    return asset;
  } finally {
    bitmap?.close();
  }
}
