import type { Profile, ProfileInput, SharedCase } from '../domain/community';
import type { SharedInterviewed } from '../domain/interviewed';
import type { CommunityRepository, PublicReader } from './community';

type Method = keyof CommunityRepository;

/** A member as visitors know them: written feedback and notes only count as shared if they opened everything. */
const asVisitorsSee = (p: Profile): Profile => ({
  ...p,
  sharing: { ...p.sharing, feedback: p.sharing.details, notes: p.sharing.details },
  // Burned books and cases only reach visitors when the member switched that on.
  burnedBooks: p.sharing.burned ? p.burnedBooks : [],
  burnedCases: p.sharing.burned ? p.burnedCases : [],
});

/**
 * Visitors get written feedback, learning notes and other notes only when the member opened everything; otherwise
 * they are dropped exactly as the database leaves them out.
 */
const forVisitors = (s: SharedCase, owner: Profile | undefined): SharedCase =>
  owner?.sharing.details ? s : { ...s, feedback: null, notes: null, otherNotes: '' };

/**
 * In-memory read access for people without an account: only members who are listed AND public, and no free text.
 * `profiles` is read live so tests can change a member's settings after creating the reader.
 */
export function createMemoryPublic(opts: { profiles: () => Profile[]; shared?: SharedCase[] }): PublicReader & { calls: string[] } {
  const calls: string[] = [];
  const isPublic = (p: Profile) => p.listed && p.publicProfile;
  // Link-only members aren't in any list, search or "recent" result; they can still be opened by exact id.
  const inDirectory = (p: Profile) => isPublic(p) && !p.publicLinkOnly;
  return {
    calls,
    async searchPeople(query: string) {
      calls.push('searchPeople');
      const q = query.trim().toLowerCase();
      return opts
        .profiles()
        .filter((p) => inDirectory(p) && p.displayName.toLowerCase().includes(q))
        .map(asVisitorsSee)
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    },
    async getPerson(userId: string) {
      calls.push('getPerson');
      const found = opts.profiles().find((p) => p.userId === userId && isPublic(p));
      return found ? asVisitorsSee(found) : null;
    },
    async recentPeople(limit: number) {
      calls.push('recentPeople');
      const people = opts.profiles().filter(inDirectory);
      return people
        .flatMap((person) => {
          const dates = (opts.shared ?? []).filter((s) => s.ownerId === person.userId).map((s) => s.date);
          return dates.length ? [{ person: asVisitorsSee(person), lastCased: dates.reduce((a, b) => (a > b ? a : b)) }] : [];
        })
        .sort((a, b) => b.lastCased.localeCompare(a.lastCased))
        .slice(0, limit);
    },
    async getSharedCases(ownerId: string) {
      calls.push('getSharedCases');
      const owner = opts.profiles().find((p) => p.userId === ownerId);
      return owner && isPublic(owner) ? (opts.shared ?? []).filter((s) => s.ownerId === ownerId).map((s) => forVisitors(s, owner)) : [];
    },
    async getInterviewed() {
      calls.push('getInterviewed');
      return []; // interviewed cases are for members only
    },
  };
}

/** In-memory community data for tests: a fixed set of members and shared cases. */
export function createMemoryCommunity(opts: {
  me: string;
  profiles?: Profile[];
  shared?: SharedCase[];
  /** The cases each member interviewed, as the database holds them (what members can see is decided by their switch). */
  interviewedOf?: (ownerId: string) => SharedInterviewed[];
}): CommunityRepository & {
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
      const publicProfile = input.listed && input.publicProfile;
      const saved: Profile = { userId: opts.me, ...input, publicProfile, publicLinkOnly: publicProfile && input.publicLinkOnly };
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
    async getInterviewed(ownerId: string): Promise<SharedInterviewed[]> {
      enter('getInterviewed');
      const owner = profiles.find((p) => p.userId === ownerId);
      // The same rules as the database function: listed, and the member switched it on.
      return owner && owner.listed && owner.sharing.interviewed ? (opts.interviewedOf?.(ownerId) ?? []) : [];
    },
    async getPublicView(ownerId: string): Promise<SharedCase[]> {
      enter('getPublicView');
      return visitors.getSharedCases(ownerId);
    },
  };
}
