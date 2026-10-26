import type { Rating, SkillGroupKey, SkillKey, CaseType } from '../domain/constants';
import type { Profile, ProfileInput, SharedCase } from '../domain/community';

/** Read-only access to member profiles and shared cases. Visitors without an account only ever get this. */
export interface CommunityReader {
  /** Listed members whose name contains the text (empty text lists members alphabetically). */
  searchPeople(query: string): Promise<Profile[]>;
  getPerson(userId: string): Promise<Profile | null>;
  /** The cases that person has chosen to share with this audience. */
  getSharedCases(ownerId: string): Promise<SharedCase[]>;
}

/** A member who has cased lately, with the date of their most recent shared case. */
export interface RecentCaser {
  person: Profile;
  /** yyyy-mm-dd: the date of the newest case they share with this audience. */
  lastCased: string;
}

/** What visitors without an account can read: the member list plus who has cased most recently. */
export interface PublicReader extends CommunityReader {
  /** Up to `limit` members, newest case first. Only cases that are visible to visitors count, never private ones. */
  recentPeople(limit: number): Promise<RecentCaser[]>;
}

/** What the app needs from the community side of the database for a signed-in member. */
export interface CommunityRepository extends CommunityReader {
  /** What visitors WITHOUT an account see of one member (for "preview"), read as a real anonymous request would. */
  getPublicView(ownerId: string): Promise<SharedCase[]>;
  /** Your own profile, or null if you haven't set one up yet (shows the onboarding screen). */
  getMyProfile(): Promise<Profile | null>;
  /** Create or update your profile and sharing switches. Takes effect for other members immediately. */
  saveProfile(input: ProfileInput): Promise<Profile>;
}

// --- row shapes (see supabase/migrations) and their mapping --------------------------------------

export interface ProfileRow {
  user_id: string;
  display_name: string;
  mba_class: string | null;
  listed: boolean;
  public_profile: boolean;
  share_cases: boolean;
  share_overall: boolean;
  share_skills: boolean;
  share_feedback: boolean;
  share_improvement: boolean;
  share_notes: boolean;
  share_partner: boolean;
}

export function rowToProfile(r: ProfileRow): Profile {
  return {
    userId: r.user_id,
    displayName: r.display_name,
    mbaClass: r.mba_class ?? '',
    listed: r.listed,
    publicProfile: r.public_profile ?? false,
    sharing: {
      cases: r.share_cases,
      overall: r.share_overall,
      skills: r.share_skills,
      feedback: r.share_feedback,
      improvement: r.share_improvement,
      notes: r.share_notes,
      partner: r.share_partner ?? false,
    },
  };
}

export function profileToRow(input: ProfileInput): Omit<ProfileRow, 'user_id'> {
  return {
    display_name: input.displayName.trim(),
    mba_class: input.mbaClass.trim() === '' ? null : input.mbaClass.trim(),
    listed: input.listed,
    public_profile: input.listed && input.publicProfile, // public needs listed (also a database rule)
    share_cases: input.sharing.cases,
    share_overall: input.sharing.overall,
    share_skills: input.sharing.skills,
    share_feedback: input.sharing.feedback,
    share_improvement: input.sharing.improvement,
    share_notes: input.sharing.notes,
    share_partner: input.sharing.partner,
  };
}

/** The columns members may read from shared_cases. `case_id` (the private table's id) is deliberately not one of them. */
export const SHARED_COLUMNS =
  'share_id, owner_id, case_date, title, source, partner, case_type, industry, overall, skill_scores, feedback, improvement_area, notes';

/** The public tables hold only public members and fields; these are the columns visitors without an account may read. */
export const PUBLIC_PROFILE_COLUMNS = 'user_id, display_name, mba_class, share_cases, share_overall, share_skills, share_improvement, share_partner';

export interface PublicProfileRow {
  user_id: string;
  display_name: string;
  mba_class: string | null;
  share_cases: boolean;
  share_overall: boolean;
  share_skills: boolean;
  share_improvement: boolean;
  share_partner: boolean;
}

/** A public member as a visitor knows them. Free text (feedback, notes) is never shared with visitors. */
export function rowToPublicProfile(r: PublicProfileRow): Profile {
  return {
    userId: r.user_id,
    displayName: r.display_name,
    mbaClass: r.mba_class ?? '',
    listed: true,
    publicProfile: true,
    sharing: {
      cases: r.share_cases,
      overall: r.share_overall,
      skills: r.share_skills,
      feedback: false,
      improvement: r.share_improvement,
      notes: false,
      partner: r.share_partner ?? false,
    },
  };
}
export const PUBLIC_SHARED_COLUMNS =
  'share_id, owner_id, case_date, title, source, partner, case_type, industry, overall, skill_scores, improvement_area';

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
  /** Absent for visitors without an account: free text is members-only. */
  feedback?: { overall?: string; skills?: Record<string, string> } | null;
  improvement_area: string | null;
  notes?: { went_well?: string; struggled?: string; concepts?: string; next_focus?: string } | null;
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
  };
}
