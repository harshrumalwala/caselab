import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeBest, parseBest, type Best } from '../../domain/warmup';
import { useWarmupSync } from '../../state/warmupSync';
import { WARMUP_KEY, warmupKeyFor } from '../../state/storageKeys';

function read(key: string): Best {
  try {
    return parseBest(window.localStorage.getItem(key));
  } catch {
    return parseBest(null); // storage blocked (private browsing, policy): play without a local copy
  }
}

function write(key: string, best: Best) {
  try {
    window.localStorage.setItem(key, JSON.stringify(best));
  } catch {
    /* the local copy just won't survive a reload */
  }
}

function forget(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing to forget */
  }
}

const isSomething = (b: Best) => b.score > 0 || b.streak > 0;
const sameBest = (a: Best, b: Best) => a.score === b.score && a.streak === b.streak;

/**
 * The best Warm-up score and streak.
 *
 * Signed in, the record lives with the account (so it follows you to any device) and this browser keeps a copy for when
 * you are offline: on load the two are merged (the better of each), and anything the account is missing is sent up.
 * Without an account (demo mode) it stays in this browser only. Either way it is private: never shown to other members.
 */
export function useBest(): [Best, (next: Best) => void] {
  const sync = useWarmupSync();
  const repository = sync?.repository;
  const key = sync ? warmupKeyFor(sync.userId) : WARMUP_KEY;

  const [best, setBest] = useState<Best>(() => {
    const own = read(key);
    // Records from before they moved to the account were saved under the plain key: the first member to sign in claims them.
    return sync ? mergeBest(own, read(WARMUP_KEY)) : own;
  });
  const latest = useRef(best);

  const adopt = useCallback(
    (incoming: Best) => {
      const merged = mergeBest(latest.current, incoming);
      latest.current = merged;
      if (isSomething(merged)) write(key, merged);
      setBest((current) => (sameBest(current, merged) ? current : merged));
      return merged;
    },
    [key],
  );

  // Merge with the account's copy when the screen opens, and send up whatever it is missing.
  useEffect(() => {
    if (!repository) return;
    let live = true;
    void (async () => {
      try {
        const saved = await repository.load();
        if (!live) return;
        const merged = adopt(saved);
        if (merged.score > saved.score || merged.streak > saved.streak) adopt(await repository.record(merged));
        forget(WARMUP_KEY); // the account has it now, so the next member to sign in here doesn't inherit it
      } catch {
        /* offline or a hiccup: the local copy is kept and is sent up next time the screen opens */
      }
    })();
    return () => {
      live = false;
    };
  }, [repository, adopt]);

  const save = useCallback(
    (next: Best) => {
      const merged = adopt(next);
      if (!repository) return;
      repository.record(merged).then(adopt, () => {
        /* kept on this device; sent up next time the screen opens */
      });
    },
    [repository, adopt],
  );

  return [best, save];
}
