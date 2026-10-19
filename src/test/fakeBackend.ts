import type { AuthApi, AuthSession } from '../data/auth';
import type { Backend } from '../data/backend';
import { createMemoryRepository } from '../data/memoryRepository';
import type { CaseLabRepository } from '../data/repository';

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

export interface FakeEnv {
  backend: { backend: Backend };
  repo: CaseLabRepository;
  /** Which repository methods the app has called (use to prove nothing was fetched/written). */
  calls: Method[];
  failOn: ReturnType<typeof flakyRepository>['failOn'];
  heal: () => void;
  signedIn: () => boolean;
}

/** A fake Supabase: email/password auth plus one persistent in-memory database. */
export function createFakeEnv({ signedIn = true }: { signedIn?: boolean } = {}): FakeEnv {
  let session: AuthSession | null = signedIn ? TEST_USER : null;
  const listeners = new Set<(s: AuthSession | null) => void>();
  const notify = () => listeners.forEach((l) => l(session));

  const auth: AuthApi = {
    async getSession() {
      return session;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async signIn(email, password) {
      if (email !== TEST_USER.email || password !== TEST_PASSWORD) throw { message: 'Invalid login credentials' };
      session = TEST_USER;
      notify();
    },
    async signOut() {
      session = null;
      notify();
    },
  };

  const flaky = flakyRepository(createMemoryRepository());
  return {
    backend: { backend: { auth, createRepository: () => flaky.repo } },
    repo: flaky.repo,
    calls: flaky.calls,
    failOn: flaky.failOn,
    heal: flaky.heal,
    signedIn: () => session !== null,
  };
}
