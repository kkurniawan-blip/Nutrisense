import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImageRef } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';

/** Longest side, in pixels, of a photo we upload. Enough for NutriScan to see the food, small enough for 2G/3G. */
export const PHOTO_MAX_EDGE = 1024;
/** JPEG quality of an uploaded photo (0..1). */
export const PHOTO_QUALITY = 0.7;

/** Width/height that fit `maxEdge` on the long side, or null when the photo is already small enough. */
function fitSize(width: number, height: number, maxEdge: number): { width: number } | { height: number } | null {
  if (!(width > 0 && height > 0) || Math.max(width, height) <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

/**
 * Shrinks a picked photo before upload: longest side at most 1024 px, re-saved as JPEG at quality 0.7.
 * A 12 MP phone photo (3-5 MB) becomes roughly 100-250 KB, which matters on weak signal and metered data.
 * Re-encoding also drops most photo metadata (to verify per platform: GPS EXIF).
 *
 * Returns an asset with the same shape as the picker's, so callers can swap it in place.
 * Never throws: if resizing fails (old phone out of memory, odd format), the original photo is returned.
 */
export async function shrinkPhoto(asset: ImagePickerAsset): Promise<ImagePickerAsset> {
  const refs: { release(): void }[] = [];
  try {
    const ctx = ImageManipulator.manipulate(asset.uri);
    refs.push(ctx);
    let size = fitSize(asset.width, asset.height, PHOTO_MAX_EDGE);
    if (size) ctx.resize(size);
    let image: ImageRef = await ctx.renderAsync();
    refs.push(image);
    // The picker did not report a size (or reported it wrong): check the decoded image and resize now.
    if (!size && Math.max(image.width, image.height) > PHOTO_MAX_EDGE) {
      size = fitSize(image.width, image.height, PHOTO_MAX_EDGE);
      const again = ImageManipulator.manipulate(image);
      refs.push(again);
      if (size) again.resize(size);
      image = await again.renderAsync();
      refs.push(image);
    }
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY });
    const base = (asset.fileName ?? 'photo').replace(/\.[^./\\]+$/, '');
    return {
      ...asset,
      uri: saved.uri,
      width: saved.width,
      height: saved.height,
      mimeType: 'image/jpeg',
      fileName: `${base}.jpg`,
      fileSize: undefined,
      base64: undefined,
      exif: undefined,
    };
  } catch {
    return asset;
  } finally {
    // Free the decoded bitmaps right away: on 2-3 GB phones they are tens of MB each.
    for (const r of refs) {
      try {
        r.release();
      } catch {
        // already released
      }
    }
  }
}
