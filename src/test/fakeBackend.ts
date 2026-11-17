import type { AuthApi, AuthEvent, AuthSession } from '../data/auth';
import type { Backend } from '../data/backend';
import { createMemoryCommunity, createMemoryPublic } from '../data/memoryCommunity';
import { createMemoryRepository } from '../data/memoryRepository';
import type { CaseLabRepository } from '../data/repository';
import { createMemoryMessages } from '../data/messages';
import { createMemoryPractice } from '../data/practiceRequests';
import { createMemoryLive } from './memoryLive';
import { createMemoryInterviewed } from '../data/interviewed';
import { toSharedInterviewed, type SharedInterviewed } from '../domain/interviewed';
import { createMemoryGoal } from '../data/weeklyGoal';
import { createMemoryInsights } from '../data/feedbackInsights';
import { createMemoryLibrary, type BookNotes } from '../data/caseLibrary';
import { blankChart, type BookSolution } from '../domain/bookSolution';
import type { LibraryCase } from '../domain/library';
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

/** A few library cases, so tests can search and pick. Ids are made up. */
export const SAMPLE_LIBRARY: LibraryCase[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Army Hotel', book: 'Booth MCG 2026-2027', school: 'Booth', year: 2026, caseType: 'Market Entry', industry: 'Travel / Hospitality', cochairPick: true, alsoIn: [], detailsKnown: true },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Hawaiian Smoothies', book: 'Booth MCG 2026-2027', school: 'Booth', year: 2026, caseType: 'Market Entry', industry: 'Consumer Products / Retail', cochairPick: true, alsoIn: ['Kellogg Case Book 2020'], detailsKnown: true },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Duck Island Beer Company', book: 'Fuqua Case Book 2017', school: 'Fuqua', year: 2017, caseType: 'Profitability', industry: 'Consumer Products / Retail', cochairPick: true, alsoIn: [], detailsKnown: true },
  { id: '00000000-0000-4000-8000-000000000004', name: 'Army Base Housing', book: 'Ross Case Book 2013', school: 'Ross', year: 2013, caseType: 'Investment Decision', industry: 'Real Estate / Construction', cochairPick: false, alsoIn: [], detailsKnown: true },
  { id: '00000000-0000-4000-8000-000000000005', name: 'Rural Broadband Rollout', book: 'Haas Case Book', school: 'Haas', year: 2015, caseType: 'Other', industry: 'Other', cochairPick: false, alsoIn: [], detailsKnown: false },
];

/** Which skills the sample library cases exercise (our private analysis, by id): only the fake "database" knows this. */
export const SAMPLE_LIBRARY_SKILLS: Record<string, string[]> = {
  '00000000-0000-4000-8000-000000000001': ['framework', 'quant'],
  '00000000-0000-4000-8000-000000000002': ['quant'],
  '00000000-0000-4000-8000-000000000003': ['quant', 'exhibits'],
  '00000000-0000-4000-8000-000000000004': ['framework'],
};

/** Our analysis of the first sample library case, which the fake "database" releases only to a member who logged it. */
export const SAMPLE_LIBRARY_NOTES: Record<string, BookNotes> = {
  '00000000-0000-4000-8000-000000000001': {
    difficulty: 3,
    skills: ['framework', 'quant'],
    concepts: ['Break-even', 'Capacity constraints', 'Seasonality'],
    summary: 'A hotel chain asks whether to open a new property near a military base.',
    strongAnswer: 'Split the question into demand, price and cost, check the break-even occupancy against realistic peak and off-peak demand, and recommend opening only if off-peak demand clears break-even.',
    pitfalls: ['Treating peak-season demand as the whole year', 'Skipping the break-even check before recommending'],
    confidence: 'high',
  },
};

/** The book's own solution to the first sample library case (the fake "database" releases it only to a member who logged it). */
export const SAMPLE_LIBRARY_SOLUTIONS: Record<string, BookSolution> = {
  '00000000-0000-4000-8000-000000000001': {
    prompt: 'Should a hotel chain open a new property near a military base?',
    facts: ['The base houses 20,000 soldiers.', 'Peak season runs four months.'],
    clarifyingQuestions: [{ question: 'Who pays for the rooms?', answer: 'The army pays a fixed per diem per soldier.', why: 'It caps the nightly price.' }],
    hypothesis: { statement: 'The chain should build if off-peak occupancy clears break-even.', basis: 'Peak demand is strong but only lasts four months.' },
    structure: [{ heading: 'Demand', keyQuestion: 'Will enough soldiers stay?', why: 'Occupancy decides revenue.', points: ['Soldiers on leave', 'Visiting families'] }],
    steps: [
      {
        title: 'Size peak demand',
        body: 'Peak demand fills the hotel for four months.',
        calc: ['Rooms = 200 x 120 nights = 24,000 room-nights'],
        whatToNotice: 'The base is busy only part of the year.',
        commonMiss: ['Treating peak demand as year-round'],
        checkYourself: ['Did you separate peak from off-peak?', 'Did you state your assumptions out loud?'],
      },
      { title: 'Check the break-even', body: 'Off-peak occupancy must clear the break-even.', calc: [], whatToNotice: '', commonMiss: [], checkYourself: ['Did you compute a break-even before recommending?'] },
    ],
    exhibits: [
      {
        title: 'Exhibit 1: Occupancy by season',
        caption: '',
        columns: ['Season', 'Occupancy'],
        rows: [['Peak', '95%'], ['Off-peak', '40%']],
        approx: false,
        howToRead: 'Compare the two seasons first, then ask which one carries the year.',
        takeaways: ['Off-peak occupancy of 40% is the number that decides the case.'],
        chart: { ...blankChart, kind: 'bar', unit: '%', categories: ['Peak', 'Off-peak'], series: [{ name: 'Occupancy', values: [95, 40], labels: ['95%', '40%'], type: 'bar', color: '' }] },
        cut: [],
        shortened: [],
      },
    ],
    recommendation: 'Open the hotel only if off-peak occupancy clears the break-even.',
    recommendationDetail: {
      because: ['Peak occupancy of 95% only lasts four months.', 'Off-peak occupancy of 40% is below break-even.'],
      delivery: 'I would not open it yet. Peak demand is strong, but it only lasts four months. Off-peak occupancy is 40%, below break-even. The next step is to test off-peak demand.',
      commonMisses: ['Leaving out the off-peak months'],
    },
    risks: ['Base closure'],
    nextSteps: ['Survey soldiers'],
    ourTakeaways: [
      { title: 'Peak demand is not the year', detail: 'Always check what the quiet months look like before you size a project.', from: 'exhibit' },
      { title: 'The per diem caps the price', detail: 'The allowance has to cover meals too.', from: 'prompt' },
    ],
    confidence: 'high',
  },
};

export const MY_PROFILE: Profile = {
  userId: TEST_USER.userId,
  displayName: 'Test User',
  mbaClass: 'Class of 2027',
  listed: true,
  publicProfile: false, burnedBooks: [], burnedCases: [],
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
  /** The member's live case with Bucket: the real engine and handler over an in-memory "database", with a scripted coach (`live.control.reply`). */
  live: ReturnType<typeof createMemoryLive>;
  /** The member's Warm-up record, as the "database" holds it. */
  warmup: ReturnType<typeof createMemoryWarmup>;
  /** The cases the member ran as the interviewer, as the "database" holds them. */
  interviewed: ReturnType<typeof createMemoryInterviewed>;
  /** The member's weekly goal, as the "database" holds it. */
  goal: ReturnType<typeof createMemoryGoal>;
  /** The casebook library, as the database holds it (a few sample cases; see `library.cases`). */
  library: ReturnType<typeof createMemoryLibrary>;
  /** The member's Coach's read, as the "function" and the table hold it (the answer is scripted: see `state.next`). */
  insights: ReturnType<typeof createMemoryInsights>;
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
  /** The ids of accounts that were deleted through the app. */
  deletedAccounts: string[];
  /** Make the next account deletion fail (a dropped connection, say); `undefined` clears it. */
  failAccountDeletion(error?: unknown): void;
}

interface Options {
  signedIn?: boolean;
  /** Start with a finished profile (default) or none, to see onboarding. */
  profile?: Profile | null;
  members?: Profile[];
  shared?: SharedCase[];
  /** The cases other members interviewed (each is only visible while that member's switch is on). */
  interviewedBy?: Record<string, SharedInterviewed[]>;
}

/** A fake Supabase: email/password auth with email verification, one in-memory database, and a community. */
export function createFakeEnv({ signedIn = true, profile = MY_PROFILE, members = [], shared = [], interviewedBy = {} }: Options = {}): FakeEnv {
  let session: AuthSession | null = signedIn ? TEST_USER : null;
  let password = TEST_PASSWORD;
  const accounts = new Map<string, { verified: boolean; userId: string }>([[TEST_USER.email, { verified: true, userId: TEST_USER.userId }]]);
  const listeners = new Set<(s: AuthSession | null, e: AuthEvent) => void>();
  const notify = (e: AuthEvent) => listeners.forEach((l) => l(session, e));
  const emails: FakeEnv['emails'] = [];
  const deletedAccounts: string[] = [];
  let deleteFailure: unknown = null;

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
    async deleteAccount() {
      if (deleteFailure) throw deleteFailure;
      if (!session) throw { message: 'Not signed in' };
      deletedAccounts.push(session.userId);
      accounts.delete(session.email);
      session = null;
      notify('signed_out');
    },
  };

  const flaky = flakyRepository(createMemoryRepository());
  const community = createMemoryCommunity({
    me: TEST_USER.userId,
    profiles: [...(profile ? [profile] : []), ...members],
    shared,
    interviewedOf: (id) => (id === TEST_USER.userId ? interviewed.saved.map(toSharedInterviewed) : (interviewedBy[id] ?? [])),
  });

  const warmup = createMemoryWarmup();
  const goal = createMemoryGoal();
  const insights = createMemoryInsights();
  const library = createMemoryLibrary(SAMPLE_LIBRARY, async () => (await flaky.repo.loadAll()).cases, SAMPLE_LIBRARY_SKILLS, SAMPLE_LIBRARY_NOTES, SAMPLE_LIBRARY_SOLUTIONS);
  const interviewed = createMemoryInterviewed();
  const practice = createMemoryPractice(() =>
    community.profiles.map((p) => ({ userId: p.userId, name: p.displayName, open: p.listed })),
  );
  const myPractice = practice.as(TEST_USER.userId);
  const chat = createMemoryMessages(practice, () => community.profiles.map((p) => ({ userId: p.userId, name: p.displayName })));
  const myChat = chat.as(TEST_USER.userId);
  const live = createMemoryLive({
    userId: TEST_USER.userId,
    cases: { [SAMPLE_LIBRARY[0].id]: { info: { name: SAMPLE_LIBRARY[0].name, book: SAMPLE_LIBRARY[0].book, caseType: SAMPLE_LIBRARY[0].caseType, industry: SAMPLE_LIBRARY[0].industry }, solution: SAMPLE_LIBRARY_SOLUTIONS[SAMPLE_LIBRARY[0].id] } },
  });
  const publicReader = createMemoryPublic({ profiles: () => community.profiles, shared });

  return {
    backend: {
      backend: {
        auth,
        createRepository: () => flaky.repo,
        createCommunity: () => community,
        createWarmup: () => warmup,
        createGoal: () => goal,
        createInsights: () => insights,
        createLibrary: () => library,
        createInterviewed: () => interviewed,
        createPractice: () => myPractice,
        createMessages: () => myChat,
        createLive: () => live,
        createPublicCommunity: () => publicReader,
      },
    },
    repo: flaky.repo,
    community,
    warmup,
    goal,
    insights,
    library,
    interviewed,
    practice: Object.assign(practice, { mine: myPractice }),
    chat: Object.assign(chat, { mine: myChat }),
    live,
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
    deletedAccounts,
    failAccountDeletion(error) {
      deleteFailure = error ?? null;
    },
  };
}
