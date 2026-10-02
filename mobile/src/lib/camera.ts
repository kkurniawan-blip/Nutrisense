import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Linking, Platform } from 'react-native';

/**
 * - 'granted': go ahead.
 * - 'denied': the person said no this time; asking again later will show the system dialog again.
 * - 'blocked': the phone will not ask again ("Don't ask again", or denied twice on Android 11+).
 *   Only the phone's Settings can turn it back on, so show a button that calls openSettings().
 */
export type PermissionState = 'granted' | 'denied' | 'blocked';

interface Perm {
  granted: boolean;
  canAskAgain: boolean;
}

async function ensure(get: () => Promise<Perm>, request: () => Promise<Perm>): Promise<PermissionState> {
  try {
    const now = await get();
    if (now.granted) return 'granted';
    // Already blocked: requesting would return at once without a dialog, so say so directly.
    if (!now.canAskAgain) return 'blocked';
    const asked = await request();
    if (asked.granted) return 'granted';
    return asked.canAskAgain ? 'denied' : 'blocked';
  } catch {
    // Some browsers/phones throw instead of answering; treat it as a plain "no" so the screen can explain.
    return 'denied';
  }
}

/** Camera, for NutriScan photos and locker / facility QR codes. Shows the system dialog only when it can. */
export function ensureCamera(): Promise<PermissionState> {
  return ensure(Camera.getCameraPermissionsAsync, Camera.requestCameraPermissionsAsync);
}

/** Photo gallery, for choosing a meal photo. iOS "limited" access counts as granted (the picker still works). */
export function ensurePhotos(): Promise<PermissionState> {
  return ensure(
    () => ImagePicker.getMediaLibraryPermissionsAsync(),
    () => ImagePicker.requestMediaLibraryPermissionsAsync(),
  );
}

/** True when this platform can open the app's settings page (not on web). */
export const canOpenSettings = Platform.OS !== 'web';

/** Opens this app's page in the phone's Settings, where Camera / Photos can be switched back on. */
export async function openSettings(): Promise<boolean> {
  if (!canOpenSettings) return false;
  try {
    await Linking.openSettings();
    return true;
  } catch {
    return false;
  }
}

/**
 * i18n keys the screens should show for each state (strings live in i18n.ts, owned by the frontend).
 * 'granted' has no message.
 */
export const PERMISSION_TEXT = {
  camera: { denied: 'permCameraDenied', blocked: 'permCameraBlocked' },
  photos: { denied: 'permPhotosDenied', blocked: 'permPhotosBlocked' },
  openSettings: 'permOpenSettings',
} as const;
