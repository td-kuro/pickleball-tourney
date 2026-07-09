import { useEffect, useState } from 'react';

// Keeps a piece of React state in sync with localStorage, so data
// survives a page refresh. Falls back to initialValue if nothing is
// stored yet, or if the stored value can't be parsed.
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}
