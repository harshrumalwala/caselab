// Browser-only UI conveniences. None of these hold saved cases: those live only in Supabase.
export const DRAFT_KEY = 'caselab:v1:draft'; // half-written Log Case form
export const MODE_KEY = 'caselab:v1:mode'; // demo mode flag (per tab session)
export const THEME_KEY = 'caselab:v1:theme';
// Best Warm-up score and streak. Without an account (tests, isolated use) the plain key is all there is; for a signed-in member
// it is a leftover from before records moved to the account, claimed once by whoever signs in first, and each member's own
// copy lives under a key with their id as an offline cache.
export const WARMUP_KEY = 'caselab:v1:warmup';
export const warmupKeyFor = (userId: string) => `${WARMUP_KEY}:${userId}`;

/** Forget everything that is private to the signed-in user. */
export function clearUserBrowserState(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(`${WARMUP_KEY}:`)) window.localStorage.removeItem(key); // a member's cached Warm-up record
    }
    window.sessionStorage.removeItem(MODE_KEY);
  } catch {
    /* storage unavailable: nothing to clear */
  }
}
