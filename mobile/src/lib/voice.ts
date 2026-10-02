import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

/**
 * Indonesian voice codes: "id-ID" / "id_ID", the legacy Java code "in-ID" that some Android phones still report,
 * and ISO 639-2 "ind".
 */
const INDONESIAN = /^(id|in|ind)([-_]|$)/i;

let cached: boolean | null = null;
let pending: Promise<boolean> | null = null;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve('timeout');
      },
    );
  });
}

async function check(): Promise<boolean> {
  if (Platform.OS === 'web') {
    // Read the browser directly: expo-speech's web voice list waits for "voiceschanged", which some browsers never fire.
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) {
      cached = false;
      return false;
    }
    const voices = synth.getVoices();
    // An empty list usually means "not loaded yet": let the button try rather than hide it. Check again next time.
    if (!voices.length) return true;
    cached = voices.some((v) => INDONESIAN.test(v.lang));
    return cached;
  }
  const voices = await withTimeout(Speech.getAvailableVoicesAsync(), 3000);
  // Android's text-to-speech engine can answer [] (or slowly) right after start-up: do not remember that as "no voice".
  if (voices === 'timeout' || !voices.length) return true;
  cached = voices.some((v) => INDONESIAN.test(v.language));
  return cached;
}

/**
 * Whether the phone can read Indonesian aloud (an id-ID text-to-speech voice is installed).
 * Without one, Android reads Indonesian text with an English voice, which a mother cannot follow.
 * The answer is cached once known; when the phone cannot tell yet, this returns true and asks again next call.
 */
export function hasIndonesianVoice(): Promise<boolean> {
  if (cached !== null) return Promise.resolve(cached);
  if (!pending) {
    pending = check()
      .catch(() => true)
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}
