import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { api } from './api';
import type { MealItem } from './types';

export interface ScanResult {
  available: boolean;
  message?: string;
  is_food?: boolean;
  items: MealItem[];
  notes?: string;
}

/** Foods in the order a mother in NTT is most likely to have them; breast milk is not an ingredient. */
export const KITCHEN_ORDER = [
  'telur', 'tempe', 'tahu', 'ikan', 'ikan_teri', 'nasi', 'jagung', 'ubi_jalar', 'singkong', 'daun_kelor', 'bayam',
  'daun_singkong', 'wortel', 'labu', 'pisang', 'pepaya', 'mangga', 'kacang_hijau', 'kacang_tanah', 'ayam', 'hati_ayam',
  'daging_sapi', 'daging_babi', 'susu', 'jeruk', 'sayur_sop', 'bubur_beras', 'roti', 'mie', 'biskuit', 'pmt_biskuit',
];

/** Opens the camera or the gallery. Returns null when cancelled, 'denied' without permission. */
export async function pickPhoto(camera: boolean): Promise<ImagePicker.ImagePickerAsset | null | 'denied'> {
  const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return 'denied';
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
  const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  return res.canceled || !res.assets[0] ? null : res.assets[0];
}

/** Sends the photo to NutriScan, which lists the foods it can see. */
export async function scanPhoto(childId: number | string, asset: ImagePicker.ImagePickerAsset, lang: string): Promise<ScanResult> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    form.append('image', await (await fetch(asset.uri)).blob(), asset.fileName ?? 'food.jpg');
  } else {
    form.append('image', { uri: asset.uri, name: asset.fileName ?? 'food.jpg', type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
  }
  return api<ScanResult>(`/api/children/${childId}/nutriscan?lang=${lang}`, { form, method: 'POST', timeoutMs: 120000 });
}

/** "Rp 2.500" (id) / "Rp 2,500" (en), without relying on the phone's Intl support. */
export function rupiah(n: number, lang: string): string {
  const digits = String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'id' ? '.' : ',');
  return `Rp ${digits}`;
}
