// Browser-only UI conveniences. None of these hold saved cases: those live only in Supabase.
export const DRAFT_KEY = 'caselab:v1:draft'; // half-written Log Case form
export const MODE_KEY = 'caselab:v1:mode'; // demo mode flag (per tab session)
export const THEME_KEY = 'caselab:v1:theme';

/** Forget everything that is private to the signed-in user. */
export function clearUserBrowserState(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
    window.sessionStorage.removeItem(MODE_KEY);
  } catch {
    /* storage unavailable: nothing to clear */
  }
}
