import { createClient } from '@supabase/supabase-js';
import { createSupabaseAuth, type AuthApi } from './auth';
import type { CommunityRepository, PublicReader } from './community';
import type { CaseLabRepository } from './repository';
import { SupabaseInterviewed, type InterviewedRepository } from './interviewed';
import { SupabaseGoal, type GoalRepository } from './weeklyGoal';
import { SupabaseWarmup, type WarmupRepository } from './warmupBest';
import { PublicCommunity, SupabaseCommunity } from './supabaseCommunity';
import { SupabaseMessages, type MessagesRepository } from './messages';
import { SupabasePractice, type PracticeRepository } from './practiceRequests';
import { SupabaseRepository } from './supabaseRepository';

/** Everything the app needs from the outside world: who you are, where your data lives, and the community. */
export interface Backend {
  auth: AuthApi;
  createRepository(): CaseLabRepository;
  createCommunity(userId: string): CommunityRepository;
  /** The signed-in member's practice requests (sent and received). */
  createPractice(): PracticeRepository;
  /** The signed-in member's private conversations. */
  createMessages(): MessagesRepository;
  /** The signed-in member's best Warm-up score and streak. */
  createWarmup(userId: string): WarmupRepository;
  /** The cases the signed-in member ran as the interviewer (private, kept apart from the cases they solved). */
  createInterviewed(): InterviewedRepository;
  /** The signed-in member's private weekly practice goal. */
  createGoal(userId: string): GoalRepository;
  /** Read-only access for people without an account (the landing page). */
  createPublicCommunity(): PublicReader;
  /** Set when the page was opened from an email link that failed (expired, already used). */
  linkProblem?: string;
}

export type BackendResult = { backend: Backend } | { problem: string };

/**
 * Email links come back to this page as `#error=...&error_description=...` when they fail.
 * Read it before the Supabase client starts and tidies the address bar.
 */
export function readLinkProblem(hash: string): string | undefined {
  const params = new URLSearchParams(hash.replace(/^#\/?/, ''));
  if (!params.get('error') && !params.get('error_code')) return undefined;
  const code = params.get('error_code');
  if (code === 'otp_expired') return 'That email link has expired or was already used. Request a new one below.';
  return params.get('error_description')?.replace(/\+/g, ' ') ?? 'That email link did not work. Request a new one below.';
}

/**
 * Builds the Supabase backend from the two public settings in the environment. If they are
 * missing the app says so on screen; it never falls back to some other kind of storage.
 */
export function createSupabaseBackend(
  url: string | undefined = import.meta.env.VITE_SUPABASE_URL,
  key: string | undefined = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
): BackendResult {
  const missing = [!url && 'VITE_SUPABASE_URL', !key && 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter(Boolean);
  if (missing.length > 0 || !url || !key) {
    return { problem: `Missing configuration: ${missing.join(' and ')}.` };
  }
  if (!/^https?:\/\//.test(url)) {
    return { problem: 'VITE_SUPABASE_URL must start with https:// (copy it from Supabase → Project Settings → API).' };
  }
  if (key.startsWith('sb_secret_') || /service_role/i.test(key)) {
    return {
      problem:
        'VITE_SUPABASE_PUBLISHABLE_KEY looks like a secret key. Never put a secret or service_role key in the browser; use the publishable key.',
    };
  }

  const linkProblem = typeof window === 'undefined' ? undefined : readLinkProblem(window.location.hash);

  // detectSessionInUrl lets the verification and password-reset links sign the person in.
  const client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  // A second client that never holds a session: everything it does runs as a visitor without an account.
  const anon = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    backend: {
      auth: createSupabaseAuth(client),
      createRepository: () => new SupabaseRepository(client),
      createCommunity: (userId) => new SupabaseCommunity(client, userId, anon),
      createPractice: () => new SupabasePractice(client),
      createMessages: () => new SupabaseMessages(client),
      createWarmup: () => new SupabaseWarmup(client),
      createGoal: (userId) => new SupabaseGoal(client, userId),
      createInterviewed: () => new SupabaseInterviewed(client),
      createPublicCommunity: () => new PublicCommunity(anon),
      linkProblem,
    },
  };
}
