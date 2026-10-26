import type { Profile, ProfileInput, SharedCase } from '../domain/community';
import type { CommunityRepository, PublicReader } from './community';

type Method = keyof CommunityRepository;

/** Visitors never get free text: drop it exactly as the database does (those columns aren't granted to them). */
const forVisitors = (s: SharedCase): SharedCase => ({ ...s, feedback: null, notes: null });

/**
 * In-memory read access for people without an account: only members who are listed AND public, and no free text.
 * `profiles` is read live so tests can change a member's settings after creating the reader.
 */
export function createMemoryPublic(opts: { profiles: () => Profile[]; shared?: SharedCase[] }): PublicReader & { calls: string[] } {
  const calls: string[] = [];
  const isPublic = (p: Profile) => p.listed && p.publicProfile;
  return {
    calls,
    async searchPeople(query: string) {
      calls.push('searchPeople');
      const q = query.trim().toLowerCase();
      return opts
        .profiles()
        .filter((p) => isPublic(p) && p.displayName.toLowerCase().includes(q))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    },
    async getPerson(userId: string) {
      calls.push('getPerson');
      return opts.profiles().find((p) => p.userId === userId && isPublic(p)) ?? null;
    },
    async recentPeople(limit: number) {
      calls.push('recentPeople');
      const people = opts.profiles().filter(isPublic);
      return people
        .flatMap((person) => {
          const dates = (opts.shared ?? []).filter((s) => s.ownerId === person.userId).map((s) => s.date);
          return dates.length ? [{ person, lastCased: dates.reduce((a, b) => (a > b ? a : b)) }] : [];
        })
        .sort((a, b) => b.lastCased.localeCompare(a.lastCased))
        .slice(0, limit);
    },
    async getSharedCases(ownerId: string) {
      calls.push('getSharedCases');
      const owner = opts.profiles().find((p) => p.userId === ownerId);
      return owner && isPublic(owner) ? (opts.shared ?? []).filter((s) => s.ownerId === ownerId).map(forVisitors) : [];
    },
  };
}

/** In-memory community data for tests: a fixed set of members and shared cases. */
export function createMemoryCommunity(opts: { me: string; profiles?: Profile[]; shared?: SharedCase[] }): CommunityRepository & {
  calls: string[];
  profiles: Profile[];
  /** Make a method fail like a dropped connection until `heal()`. */
  failOn(method: Method, error?: unknown): void;
  heal(): void;
} {
  const profiles = [...(opts.profiles ?? [])];
  const calls: string[] = [];
  const failing = new Map<Method, unknown>();
  const visitors = createMemoryPublic({ profiles: () => profiles, shared: opts.shared });

  const enter = (name: Method) => {
    calls.push(name);
    if (failing.has(name)) throw failing.get(name);
  };

  return {
    calls,
    profiles,
    failOn(method, error = { message: 'TypeError: Failed to fetch' }) {
      failing.set(method, error);
    },
    heal() {
      failing.clear();
    },
    async getMyProfile() {
      enter('getMyProfile');
      return profiles.find((p) => p.userId === opts.me) ?? null;
    },
    async saveProfile(input: ProfileInput) {
      enter('saveProfile');
      const saved: Profile = { userId: opts.me, ...input, publicProfile: input.listed && input.publicProfile };
      const i = profiles.findIndex((p) => p.userId === opts.me);
      if (i === -1) profiles.push(saved);
      else profiles[i] = saved;
      return saved;
    },
    async searchPeople(query: string) {
      enter('searchPeople');
      const q = query.trim().toLowerCase();
      return profiles
        .filter((p) => p.userId !== opts.me && p.listed && p.displayName.toLowerCase().includes(q))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    },
    async getPerson(userId: string) {
      enter('getPerson');
      return profiles.find((p) => p.userId === userId && (p.listed || userId === opts.me)) ?? null;
    },
    async getSharedCases(ownerId: string): Promise<SharedCase[]> {
      enter('getSharedCases');
      return (opts.shared ?? []).filter((s) => s.ownerId === ownerId);
    },
    async getPublicView(ownerId: string): Promise<SharedCase[]> {
      enter('getPublicView');
      return visitors.getSharedCases(ownerId);
    },
  };
}
