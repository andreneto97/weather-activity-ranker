import { useCallback, useEffect, useState } from 'react';

const KEY = 'wa:recent';
const MAX = 10;

export interface RecentCity {
  readonly name: string;
  readonly at: number;
}

function read(): RecentCity[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (v): v is RecentCity =>
          typeof v === 'object' &&
          v !== null &&
          typeof (v as RecentCity).name === 'string' &&
          typeof (v as RecentCity).at === 'number',
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function useCityHistory(): {
  recent: RecentCity[];
  push: (name: string) => void;
  clear: () => void;
} {
  const [recent, setRecent] = useState<RecentCity[]>(() => read());

  const push = useCallback((name: string) => {
    setRecent((prev) => {
      const filtered = prev.filter((c) => c.name.toLowerCase() !== name.toLowerCase());
      const next = [{ name, at: Date.now() }, ...filtered].slice(0, MAX);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // localStorage may be disabled (private mode); silently drop.
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setRecent([]);
    try {
      localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    // sync across tabs
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === KEY) setRecent(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { recent, push, clear };
}
