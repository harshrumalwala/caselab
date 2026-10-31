import type { AuthApi, AuthEvent, AuthSession } from '../data/auth';
import type { Backend } from '../data/backend';
import { createMemoryCommunity, createMemoryPublic } from '../data/memoryCommunity';
import { createMemoryRepository } from '../data/memoryRepository';
import type { CaseLabRepository } from '../data/repository';
import { createMemoryMessages } from '../data/messages';
import { createMemoryPractice } from '../data/practiceRequests';
import { createMemoryInterviewed } from '../data/interviewed';
import { createMemoryGoal } from '../data/weeklyGoal';
import { createMemoryWarmup } from '../data/warmupBest';
import { NO_SHARING, type Profile, type SharedCase } from '../domain/community';

export const TEST_USER: AuthSession = { userId: 'user-1', email: 'me@booth.edu' };
export const TEST_PASSWORD = 'correct horse';

type Method = keyof CaseLabRepository;

/** A "database" you can break on demand: wrap a repository and make chosen methods fail. */
export function flakyRepository(base: CaseLabRepository) {
  const failing = new Map<Method, unknown>();
  const calls: Method[] = [];
  const repo = {} as CaseLabRepository;
  for (const name of Object.keys(base) as Method[]) {
    (repo as unknown as Record<string, unknown>)[name] = async (...args: unknown[]) => {
      calls.push(name);
      if (failing.has(name)) throw failing.get(name);
      return (base[name] as (...a: unknown[]) => Promise<unknown>)(...args);
    };
  }
  return {
    repo,
    calls,
    failOn(method: Method, error: unknown = { message: 'TypeError: Failed to fetch' }) {
      failing.set(method, error);
    },
    heal() {
      failing.clear();
    },
  };
}

export const MY_PROFILE: Profile = {
  userId: TEST_USER.userId,
  displayName: 'Test User',
  mbaClass: 'Class of 2027',
  listed: true,
  publicProfile: false, publicLinkOnly: false, burnedBooks: [], burnedCases: [],
  sharing: NO_SHARING,
};

export interface FakeEnv {
  backend: { backend: Backend };
  repo: CaseLabRepository;
  community: ReturnType<typeof createMemoryCommunity>;
  /** Practice requests between all the fake members; `as(userId)` is that member's view of them. */
  practice: ReturnType<typeof createMemoryPractice> & { mine: ReturnType<ReturnType<typeof createMemoryPractice>['as']> };
  /** Conversations between all the fake members; `as(userId)` is that member's view. */
  chat: ReturnType<typeof createMemoryMessages> & { mine: ReturnType<ReturnType<typeof createMemoryMessages>['as']> };
  /** The member's Warm-up record, as the "database" holds it. */
  warmup: ReturnType<typeof createMemoryWarmup>;
  /** The cases the member ran as the interviewer, as the "database" holds them. */
  interviewed: ReturnType<typeof createMemoryInterviewed>;
  /** The member's weekly goal, as the "database" holds it. */
  goal: ReturnType<typeof createMemoryGoal>;
  /** What visitors without an account can read (also records which methods were called). */
  publicReader: ReturnType<typeof createMemoryPublic>;
  /** Which repository methods the app has called (use to prove nothing was fetched/written). */
  calls: Method[];
  failOn: ReturnType<typeof flakyRepository>['failOn'];
  heal: () => void;
  signedIn: () => boolean;
  /** Emails the fake "Supabase" has sent: { kind, to }. Signing up queues a verification email. */
  emails: { kind: 'verify' | 'reset'; to: string }[];
  /** Simulate clicking the emailed verification link: the account becomes verified and signed in. */
  clickVerificationLink(email: string): void;
  /** Simulate clicking the password-reset link. */
  clickResetLink(email: string): void;
  password: () => string;
}

interface Options {
  signedIn?: boolean;
  /** Start with a finished profile (default) or none, to see onboarding. */
  profile?: Profile | null;
  members?: Profile[];
  shared?: SharedCase[];
}

/** A fake Supabase: email/password auth with email verification, one in-memory database, and a community. */
export function createFakeEnv({ signedIn = true, profile = MY_PROFILE, members = [], shared = [] }: Options = {}): FakeEnv {
  let session: AuthSession | null = signedIn ? TEST_USER : null;
  let password = TEST_PASSWORD;
  const accounts = new Map<string, { verified: boolean; userId: string }>([[TEST_USER.email, { verified: true, userId: TEST_USER.userId }]]);
  const listeners = new Set<(s: AuthSession | null, e: AuthEvent) => void>();
  const notify = (e: AuthEvent) => listeners.forEach((l) => l(session, e));
  const emails: FakeEnv['emails'] = [];

  const auth: AuthApi = {
    async getSession() {
      return session;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async signIn(email, pw) {
      const account = accounts.get(email);
      if (!account || (email === TEST_USER.email && pw !== password) || (email !== TEST_USER.email && pw !== 'new-password-1')) {
        throw { message: 'Invalid login credentials' };
      }
      if (!account.verified) throw { message: 'Email not confirmed', code: 'email_not_confirmed' };
      session = { userId: account.userId, email };
      notify('signed_in');
    },
    async signUp(email) {
      if (!accounts.has(email)) accounts.set(email, { verified: false, userId: `user-${accounts.size + 1}` });
      emails.push({ kind: 'verify', to: email });
      return { needsVerification: true };
    },
    async resendConfirmation(email) {
      emails.push({ kind: 'verify', to: email });
    },
    async requestPasswordReset(email) {
      emails.push({ kind: 'reset', to: email });
    },
    async updatePassword(pw) {
      if (pw === password) throw { message: 'New password should be different from the old password.', code: 'same_password' };
      password = pw;
      notify('updated');
    },
    async signOut() {
      session = null;
      notify('signed_out');
    },
  };

  const flaky = flakyRepository(createMemoryRepository());
  const community = createMemoryCommunity({
    me: TEST_USER.userId,
    profiles: [...(profile ? [profile] : []), ...members],
    shared,
  });

  const warmup = createMemoryWarmup();
  const goal = createMemoryGoal();
  const interviewed = createMemoryInterviewed();
  const practice = createMemoryPractice(() =>
    community.profiles.map((p) => ({ userId: p.userId, name: p.displayName, open: p.listed })),
  );
  const myPractice = practice.as(TEST_USER.userId);
  const chat = createMemoryMessages(practice, () => community.profiles.map((p) => ({ userId: p.userId, name: p.displayName })));
  const myChat = chat.as(TEST_USER.userId);
  const publicReader = createMemoryPublic({ profiles: () => community.profiles, shared });

  return {
    backend: {
      backend: {
        auth,
        createRepository: () => flaky.repo,
        createCommunity: () => community,
        createWarmup: () => warmup,
        createGoal: () => goal,
        createInterviewed: () => interviewed,
        createPractice: () => myPractice,
        createMessages: () => myChat,
        createPublicCommunity: () => publicReader,
      },
    },
    repo: flaky.repo,
    community,
    warmup,
    goal,
    interviewed,
    practice: Object.assign(practice, { mine: myPractice }),
    chat: Object.assign(chat, { mine: myChat }),
    publicReader,
    calls: flaky.calls,
    failOn: flaky.failOn,
    heal: flaky.heal,
    signedIn: () => session !== null,
    emails,
    clickVerificationLink(email) {
      const account = accounts.get(email);
      if (!account) throw new Error(`no account for ${email}`);
      account.verified = true;
      session = { userId: account.userId, email };
      notify('signed_in');
    },
    clickResetLink(email) {
      const account = accounts.get(email);
      if (!account) throw new Error(`no account for ${email}`);
      session = { userId: account.userId, email };
      notify('recovery');
    },
    password: () => password,
  };
}
