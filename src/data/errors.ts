/** An error whose message is safe and useful to show on screen. */
export class DataError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'DataError';
    this.cause = cause;
  }
}

interface PostgrestLike {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
}

/** Turn whatever Supabase / fetch threw into a plain-English sentence. */
export function describeError(e: unknown): string {
  if (e instanceof DataError) return e.message;
  const err = (typeof e === 'object' && e !== null ? e : { message: String(e) }) as PostgrestLike;
  const msg = err.message ?? '';
  const code = err.code ?? '';

  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg)) {
    return "Can't reach Supabase. Check your internet connection and try again.";
  }
  if (code === 'PGRST301' || /jwt|not authenticated|invalid refresh token|session/i.test(msg) || err.status === 401) {
    return 'Your session expired. Please sign in again.';
  }
  if (code === 'PGRST205' || code === '42P01' || /could not find the table|schema cache|does not exist/i.test(msg)) {
    return "CaseLab's database tables are missing. Apply the Supabase migration (see the README), then reload.";
  }
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return "Supabase refused that change (permission denied). Try signing out and back in.";
  }
  if (code === 'PGRST116') return 'That record no longer exists. It may have been deleted on another device.';
  if (code === '23514' || code === '23502' || code === '22P02' || code === '23503') {
    return `Supabase rejected the data: ${msg || 'it breaks a database rule'}.`;
  }
  if (code === '23505') return 'That record already exists.';
  return msg ? `Supabase error: ${msg}` : 'Something went wrong talking to Supabase.';
}

export function toDataError(e: unknown): DataError {
  return e instanceof DataError ? e : new DataError(describeError(e), e);
}
