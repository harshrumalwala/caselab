import type { Rating, SkillGroupKey, SkillKey, CaseType } from '../domain/constants';
import type { Profile, ProfileInput, SharedCase } from '../domain/community';

/** What the app needs from the community side of the database. Supabase implements it for real data. */
export interface CommunityRepository {
  /** Your own profile, or null if you haven't set one up yet (shows the onboarding screen). */
  getMyProfile(): Promise<Profile | null>;
  /** Create or update your profile and sharing switches. Takes effect for other members immediately. */
  saveProfile(input: ProfileInput): Promise<Profile>;
  /** Listed members whose name contains the text (empty text lists members alphabetically). Never includes you. */
  searchPeople(query: string): Promise<Profile[]>;
  getPerson(userId: string): Promise<Profile | null>;
  /** The cases that person has chosen to share, exactly as the database serves them to other members. */
  getSharedCases(ownerId: string): Promise<SharedCase[]>;
}

// --- row shapes (see supabase/migrations) and their mapping --------------------------------------

export interface ProfileRow {
  user_id: string;
  display_name: string;
  mba_class: string | null;
  listed: boolean;
  share_cases: boolean;
  share_overall: boolean;
  share_skills: boolean;
  share_feedback: boolean;
  share_improvement: boolean;
  share_notes: boolean;
}

export function rowToProfile(r: ProfileRow): Profile {
  return {
    userId: r.user_id,
    displayName: r.display_name,
    mbaClass: r.mba_class ?? '',
    listed: r.listed,
    sharing: {
      cases: r.share_cases,
      overall: r.share_overall,
      skills: r.share_skills,
      feedback: r.share_feedback,
      improvement: r.share_improvement,
      notes: r.share_notes,
    },
  };
}

export function profileToRow(input: ProfileInput): Omit<ProfileRow, 'user_id'> {
  return {
    display_name: input.displayName.trim(),
    mba_class: input.mbaClass.trim() === '' ? null : input.mbaClass.trim(),
    listed: input.listed,
    share_cases: input.sharing.cases,
    share_overall: input.sharing.overall,
    share_skills: input.sharing.skills,
    share_feedback: input.sharing.feedback,
    share_improvement: input.sharing.improvement,
    share_notes: input.sharing.notes,
  };
}

/** The columns members may read from shared_cases. `case_id` (the private table's id) is deliberately not one of them. */
export const SHARED_COLUMNS =
  'share_id, owner_id, case_date, title, source, case_type, industry, overall, skill_scores, feedback, improvement_area, notes';

export interface SharedRow {
  share_id: string;
  owner_id: string;
  case_date: string;
  title: string;
  source: string | null;
  case_type: string;
  industry: string | null;
  overall: number | null;
  skill_scores: Record<string, number> | null;
  feedback: { overall?: string; skills?: Record<string, string> } | null;
  improvement_area: string | null;
  notes: { went_well?: string; struggled?: string; concepts?: string; next_focus?: string } | null;
}

export function rowToSharedCase(r: SharedRow): SharedCase {
  return {
    caseId: r.share_id,
    ownerId: r.owner_id,
    date: r.case_date,
    title: r.title,
    source: r.source ?? '',
    caseType: r.case_type as CaseType,
    industry: r.industry ?? '',
    overall: (r.overall as Rating | null) ?? null,
    skillScores: r.skill_scores as Partial<Record<SkillKey, Rating>> | null,
    feedback: r.feedback as SharedCase['feedback'],
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
