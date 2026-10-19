import type { Profile, ProfileInput, SharedCase } from '../domain/community';
import type { CommunityRepository } from './community';

type Method = keyof CommunityRepository;

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
      const saved: Profile = { userId: opts.me, ...input };
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
  };
}
