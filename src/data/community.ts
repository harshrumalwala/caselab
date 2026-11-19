import type { Rating, SkillGroupKey, SkillKey, CaseType } from '../domain/constants';
import type { SharedInterviewed } from '../domain/interviewed';
import { normalizeBurnedBooks, normalizeBurnedCases, type BurnedCase, type Profile, type ProfileInput, type SharedCase } from '../domain/community';

/**
 * What someone WITHOUT an account can read: one member at a time, and only if they have that member's exact
 * profile link. There is no list, search or count for visitors; the id in the link is the only key.
 */
export interface PublicReader {
  getPerson(userId: string): Promise<Profile | null>;
  /** The cases that person has chosen to share with this audience. */
  getSharedCases(ownerId: string): Promise<SharedCase[]>;
  /** The cases that member interviewed, if they chose to show other members. Visitors without an account always get none. */
  getInterviewed(ownerId: string): Promise<SharedInterviewed[]>;
}

/** Read-only access for a signed-in member: the same reads, plus finding other members by name. */
export interface CommunityReader extends PublicReader {
  /** Listed members whose name contains the text (empty text lists members alphabetically). */
  searchPeople(query: string): Promise<Profile[]>;
}

/** What the app needs from the community side of the database for a signed-in member. */
export interface CommunityRepository extends CommunityReader {
  /** What visitors WITHOUT an account see of one member (for "preview"), read as a real anonymous request would. */
  getPublicView(ownerId: string): Promise<SharedCase[]>;
  /** Whether a visitor's request for this member's profile finds a row (`public_person`): null means nothing is published. */
  getPublicPerson(ownerId: string): Promise<Profile | null>;
  /** Your own profile, or null if you haven't set one up yet (shows the onboarding screen). */
  getMyProfile(): Promise<Profile | null>;
  /** Create or update your profile and sharing switches. Takes effect for other members immediately. */
  saveProfile(input: ProfileInput): Promise<Profile>;
  /** Update the level you show other members. Only valid while you share it; the database refuses it otherwise. */
  saveSharedLevel(level: number): Promise<void>;
}

// --- row shapes (see supabase/migrations) and their mapping --------------------------------------

export interface ProfileRow {
  user_id: string;
  display_name: string;
  mba_class: string | null;
  listed: boolean;
  public_profile: boolean;
  public_link_only: boolean;
  burned_books: string[];
  burned_cases: unknown;
  share_cases: boolean;
  share_overall: boolean;
  share_skills: boolean;
  share_sharpening: boolean;
  share_feedback: boolean;
  share_improvement: boolean;
  share_notes: boolean;
  share_partner: boolean;
  share_details: boolean;
  share_burned: boolean;
  share_interviewed: boolean;
  share_level: boolean;
  /** The level shown to other members; null unless share_level is on (a database rule). */
  level?: number | null;
}

/** The stored list, read defensively: anything that isn't a {title, book} pair is ignored. */
function parseBurnedCases(raw: unknown): BurnedCase[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    if (!x || typeof x !== 'object') return [];
    const { title, book } = x as Record<string, unknown>;
    return typeof title === 'string' && title.trim() ? [{ title, book: typeof book === 'string' ? book : '' }] : [];
  });
}

export function rowToProfile(r: ProfileRow): Profile {
  return {
    userId: r.user_id,
    displayName: r.display_name,
    mbaClass: r.mba_class ?? '',
    listed: r.listed,
    publicProfile: r.public_profile ?? false,
    burnedBooks: r.burned_books ?? [],
    burnedCases: parseBurnedCases(r.burned_cases),
    level: r.share_level && typeof r.level === 'number' ? r.level : null,
    sharing: {
      cases: r.share_cases,
      overall: r.share_overall,
      skills: r.share_skills,
      sharpening: r.share_sharpening ?? false,
      feedback: r.share_feedback,
      improvement: r.share_improvement,
      notes: r.share_notes,
      partner: r.share_partner ?? false,
      details: r.share_details ?? false,
      burned: r.share_burned ?? false,
      interviewed: r.share_interviewed ?? false,
      level: r.share_level ?? false,
    },
  };
}

export function profileToRow(input: ProfileInput): Omit<ProfileRow, 'user_id'> {
  return {
    display_name: input.displayName.trim(),
    mba_class: input.mbaClass.trim() === '' ? null : input.mbaClass.trim(),
    listed: input.listed,
    public_profile: input.listed && input.publicProfile, // visible without an account needs listed (also a database rule)
    // Everyone visible without an account is now reachable by their link alone: never listed, searched or counted.
    // The column is history (nothing reads it), but it is still written so the database's own rule
    // "link only needs public" holds whichever version of the schema this app is talking to.
    public_link_only: input.listed && input.publicProfile,
    burned_books: normalizeBurnedBooks(input.burnedBooks),
    burned_cases: normalizeBurnedCases(input.burnedCases),
    share_cases: input.sharing.cases,
    share_overall: input.sharing.overall,
    share_skills: input.sharing.skills,
    share_sharpening: input.sharing.sharpening,
    share_feedback: input.sharing.feedback,
    share_improvement: input.sharing.improvement,
    share_notes: input.sharing.notes,
    share_partner: input.sharing.partner,
    share_details: input.sharing.details,
    share_burned: input.sharing.burned,
    share_interviewed: input.sharing.interviewed,
    share_level: input.sharing.level,
    // Switching it off clears the shown level in the same write (the database insists). While it is on the level is left alone,
    // because the app keeps it up to date separately.
    ...(input.sharing.level ? {} : { level: null }),
  };
}

/** The columns members may read from shared_cases. `case_id` (the private table's id) is deliberately not one of them. */
export const SHARED_COLUMNS =
  'share_id, owner_id, case_date, title, source, partner, case_type, industry, overall, skill_scores, feedback, improvement_area, notes, other_notes';

/** One row of `public_person(id)`: a member as someone with their link knows them. */
export interface PublicProfileRow {
  user_id: string;
  display_name: string;
  mba_class: string | null;
  share_cases: boolean;
  share_overall: boolean;
  share_skills: boolean;
  share_sharpening?: boolean;
  share_improvement: boolean;
  share_partner: boolean;
  share_details: boolean;
  share_burned: boolean;
  burned_books?: string[];
  burned_cases?: unknown;
}

/** A public member as a visitor knows them. Free text (feedback, notes) is never shared with visitors. */
export function rowToPublicProfile(r: PublicProfileRow): Profile {
  return {
    userId: r.user_id,
    displayName: r.display_name,
    mbaClass: r.mba_class ?? '',
    listed: true,
    publicProfile: true,
    // Empty unless the member also switched on showing them to visitors.
    burnedBooks: r.burned_books ?? [],
    burnedCases: parseBurnedCases(r.burned_cases),
    sharing: {
      cases: r.share_cases,
      overall: r.share_overall,
      skills: r.share_skills,
      sharpening: r.share_sharpening ?? false,
      // Written feedback and notes reach visitors only when the member opened everything.
      feedback: r.share_details ?? false,
      improvement: r.share_improvement,
      notes: r.share_details ?? false,
      partner: r.share_partner ?? false,
      details: r.share_details ?? false,
      burned: r.share_burned ?? false,
      interviewed: false, // members only: never part of what visitors see
      level: false, // likewise
    },
  };
}
export interface SharedRow {
  share_id: string;
  owner_id: string;
  case_date: string;
  title: string;
  source: string | null;
  partner?: string | null;
  case_type: string;
  industry: string | null;
  overall: number | null;
  skill_scores: Record<string, number> | null;
  /** Empty for visitors unless the member opened everything. */
  feedback?: { overall?: string; skills?: Record<string, string> } | null;
  improvement_area: string | null;
  notes?: { went_well?: string; struggled?: string; concepts?: string; next_focus?: string } | null;
  other_notes?: string | null;
}

export function rowToSharedCase(r: SharedRow): SharedCase {
  return {
    caseId: r.share_id,
    ownerId: r.owner_id,
    date: r.case_date,
    title: r.title,
    source: r.source ?? '',
    partner: r.partner ?? '',
    caseType: r.case_type as CaseType,
    industry: r.industry ?? '',
    overall: (r.overall as Rating | null) ?? null,
    skillScores: r.skill_scores as Partial<Record<SkillKey, Rating>> | null,
    feedback: (r.feedback as SharedCase['feedback']) ?? null,
    improvementArea: (r.improvement_area as SkillGroupKey | null) ?? null,
    notes: r.notes
      ? {
          wentWell: r.notes.went_well,
          struggled: r.notes.struggled,
          concepts: r.notes.concepts,
          nextFocus: r.notes.next_focus,
        }
      : null,
    otherNotes: r.other_notes ?? '',
  };
}
