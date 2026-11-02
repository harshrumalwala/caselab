import { useCallback, useEffect, useState } from 'react';
import { levelKey } from '../../state/storageKeys';

function read(userId: string): number | null {
  try {
    const raw = window.localStorage.getItem(levelKey(userId));
    const n = raw === null ? NaN : Number(raw);
    return Number.isInteger(n) && n >= 1 ? n : null;
  } catch {
    return null;
  }
}

function write(userId: string, level: number) {
  try {
    window.localStorage.setItem(levelKey(userId), String(level));
  } catch {
    /* it may celebrate again next visit, which is harmless */
  }
}

/**
 * Notices when you reach a level you haven't reached before in this browser. The first time it sees you it only notes where you
 * are (so nobody who already has cases gets a pile of celebrations), and after that every new highest level is celebrated exactly
 * once. Falling back a level (deleting cases) never takes anything away, and climbing back to a level you had isn't a new one.
 */
export function useLevelUp(userId: string, level: number, ready: boolean): { promotion: { from: number; to: number } | null; dismiss: () => void } {
  const [promotion, setPromotion] = useState<{ from: number; to: number } | null>(null);

  useEffect(() => {
    if (!ready) return;
    const seen = read(userId);
    if (seen === null) {
      write(userId, level);
    } else if (level > seen) {
      setPromotion((current) => ({ from: current?.from ?? seen, to: level }));
      write(userId, level);
    }
  }, [userId, level, ready]);

  const dismiss = useCallback(() => setPromotion(null), []);
  return { promotion, dismiss };
}
