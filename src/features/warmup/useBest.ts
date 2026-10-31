import { useCallback, useState } from 'react';
import { parseBest, type Best } from '../../domain/warmup';
import { WARMUP_KEY } from '../../state/storageKeys';

function load(): Best {
  try {
    return parseBest(window.localStorage.getItem(WARMUP_KEY));
  } catch {
    return parseBest(null); // storage blocked (private browsing, policy): play without a record
  }
}

/** The best Warm-up score and streak. Kept in this browser only: never sent anywhere, never shared with other members. */
export function useBest(): [Best, (next: Best) => void] {
  const [best, setBest] = useState<Best>(load);
  const save = useCallback((next: Best) => {
    setBest(next);
    try {
      window.localStorage.setItem(WARMUP_KEY, JSON.stringify(next));
    } catch {
      /* the record just won't survive a reload */
    }
  }, []);
  return [best, save];
}
