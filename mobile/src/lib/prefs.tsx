import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { TextScaleContext } from '../components/Text';
import { getJSON, setJSON } from './storage';

export type TextSize = 'normal' | 'large' | 'xlarge';
export const TEXT_SCALE: Record<TextSize, number> = { normal: 1, large: 1.15, xlarge: 1.3 };
const TEXT_SIZE_KEY = 'nutrisense.textSize';

interface Prefs {
  textSize: TextSize;
  setTextSize: (s: TextSize) => void;
}

const PrefsContext = createContext<Prefs | null>(null);

/** Per-phone display preferences (not tied to the account, so a shared phone keeps its setting). */
export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [textSize, setSize] = useState<TextSize>('normal');

  useEffect(() => {
    void getJSON<TextSize>(TEXT_SIZE_KEY, 'normal').then((s) => setSize(s in TEXT_SCALE ? s : 'normal'));
  }, []);

  const value = useMemo<Prefs>(
    () => ({
      textSize,
      setTextSize: (s) => {
        setSize(s);
        void setJSON(TEXT_SIZE_KEY, s);
      },
    }),
    [textSize],
  );

  return (
    <PrefsContext.Provider value={value}>
      <TextScaleContext.Provider value={TEXT_SCALE[textSize]}>{children}</TextScaleContext.Provider>
    </PrefsContext.Provider>
  );
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used inside PrefsProvider');
  return ctx;
}
