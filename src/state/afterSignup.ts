// "Create account and import" on the landing page promises an import. The email link that finishes sign-up can arrive
// minutes later, so the wish is kept in this browser and acted on the first time the new account reaches the app.
const KEY = 'caselab:v1:after-signup';
const KEPT_FOR_MS = 3 * 24 * 60 * 60 * 1000;

/** Remember that this visitor came for the Excel import. */
export function rememberImportIntent(now: number = Date.now()): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ import: true, at: now }));
  } catch {
    /* storage blocked: they just land on the dashboard, where the import card is waiting */
  }
}

/** True once, if a recent visitor asked for the import; the wish is forgotten either way. */
export function takeImportIntent(now: number = Date.now()): boolean {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return false;
    window.localStorage.removeItem(KEY);
    const at = (JSON.parse(raw) as { at?: unknown } | null)?.at;
    return typeof at === 'number' && now - at >= 0 && now - at <= KEPT_FOR_MS;
  } catch {
    return false;
  }
}
