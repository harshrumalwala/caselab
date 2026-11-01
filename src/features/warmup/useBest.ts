import { useCallback, useEffect, useRef, useState } from 'react';
import { hasAnyBest, mergeBests, NO_BESTS, parseBests, serializeBests, type Best, type Bests, type RoundLength } from '../../domain/warmup';
import { useWarmupSync } from '../../state/warmupSync';
import { WARMUP_KEY, warmupKeyFor } from '../../state/storageKeys';

function read(key: string): Bests {
  try {
    return parseBests(window.localStorage.getItem(key));
  } catch {
    return NO_BESTS; // storage blocked (private browsing, policy): play without a local copy
  }
}

function write(key: string, bests: Bests) {
  try {
    window.localStorage.setItem(key, serializeBests(bests));
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

const same = (a: Bests, b: Bests) => ([30, 60, 120] as const).every((n) => a[n].score === b[n].score && a[n].streak === b[n].streak);

/**
 * The best Warm-up score and streak for each round length (30, 60 and 120 seconds, never compared with one another).
 *
 * Signed in, the records live with the account (so they follow you to any device) and this browser keeps a copy for when you are
 * offline: on load the two are merged (the better of each, length by length), and anything the account is missing is sent up.
 * Without an account (demo mode) they stay in this browser only. Either way they are private: never shown to other members.
 */
export function useBests(): [Bests, (seconds: RoundLength, next: Best) => void] {
  const sync = useWarmupSync();
  const repository = sync?.repository;
  const key = sync ? warmupKeyFor(sync.userId) : WARMUP_KEY;

  const [bests, setBests] = useState<Bests>(() => {
    const own = read(key);
    // Records from before they moved to the account were saved under the plain key: the first member to sign in claims them.
    return sync ? mergeBests(own, read(WARMUP_KEY)) : own;
  });
  const latest = useRef(bests);

  const adopt = useCallback(
    (incoming: Bests) => {
      const merged = mergeBests(latest.current, incoming);
      latest.current = merged;
      if (hasAnyBest(merged)) write(key, merged);
      setBests((current) => (same(current, merged) ? current : merged));
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
        const saved = await repository.loadAll();
        if (!live) return;
        const merged = adopt(saved);
        for (const seconds of [30, 60, 120] as const) {
          if (merged[seconds].score > saved[seconds].score || merged[seconds].streak > saved[seconds].streak) {
            adopt({ ...NO_BESTS, [seconds]: await repository.record(merged[seconds], seconds) });
          }
        }
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
    (seconds: RoundLength, next: Best) => {
      const merged = adopt({ ...NO_BESTS, [seconds]: next });
      if (!repository) return;
      repository.record(merged[seconds], seconds).then(
        (confirmed) => adopt({ ...NO_BESTS, [seconds]: confirmed }),
        () => {
          /* kept on this device; sent up next time the screen opens */
        },
      );
    },
    [repository, adopt],
  );

  return [bests, save];
}
