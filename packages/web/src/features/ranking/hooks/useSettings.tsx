import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { env } from '../../../lib/env.js';
import type { Units } from '../../../lib/format.js';

interface Settings {
  units: Units;
  setUnits: (u: Units) => void;
  reducedMotion: boolean;
  setReducedMotion: (v: boolean) => void;
}

const UNITS_KEY = 'wa:units';
const MOTION_KEY = 'wa:reduced-motion';

const SettingsContext = createContext<Settings | null>(null);

function readUnits(): Units {
  try {
    const raw = localStorage.getItem(UNITS_KEY);
    if (raw === 'imperial' || raw === 'metric') return raw;
  } catch {
    // localStorage disabled
  }
  return env.VITE_UNITS_DEFAULT;
}

function readReducedMotion(): boolean {
  try {
    return localStorage.getItem(MOTION_KEY) === '1';
  } catch {
    return false;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [units, setUnitsState] = useState<Units>(() => readUnits());
  const [reducedMotion, setReducedMotionState] = useState<boolean>(() => readReducedMotion());

  const setUnits = useCallback((u: Units) => {
    setUnitsState(u);
    try {
      localStorage.setItem(UNITS_KEY, u);
    } catch {
      // ignore
    }
  }, []);

  const setReducedMotion = useCallback((v: boolean) => {
    setReducedMotionState(v);
    try {
      localStorage.setItem(MOTION_KEY, v ? '1' : '0');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === UNITS_KEY) setUnitsState(readUnits());
      if (ev.key === MOTION_KEY) setReducedMotionState(readReducedMotion());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(
    () => ({ units, setUnits, reducedMotion, setReducedMotion }),
    [units, setUnits, reducedMotion, setReducedMotion],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Settings {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
